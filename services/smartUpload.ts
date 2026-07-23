import API from "@/lib/api";
import {
  DIRECT_UPLOAD_CONCURRENCY,
  mapWithConcurrency,
  uploadFileToReportSession,
} from "@/services/directUpload";
import type {
  SmartUploadDraft,
  SmartUploadKind,
  SmartUploadStoredFile,
} from "@/components/forms/smartUpload/storage";

export type SmartUploadEndpoint = "/asset" | "/lot-listing";

export type SmartUploadTarget = {
  fileId: string;
  uploadUrl: string;
  method: "PUT";
  contentType: string;
};

export type SmartUploadGroup = {
  groupIndex: number;
  imageCount: number;
  fileIds: string[];
  overLimit: boolean;
};

export type SmartUploadMetric = {
  fileId: string;
  meanLuminance: number;
  darkPixelRatio: number;
  variance: number;
  isDivider: boolean;
  error?: string;
};

export type SmartUploadGrouping = {
  sessionId: string;
  smartUpload: true;
  groupingStatus:
    | "uploading"
    | "classifying"
    | "review_ready"
    | "confirmed"
    | "failed";
  progressPercent: number;
  algorithmVersion?: string;
  classificationJobId?: string;
  groups: SmartUploadGroup[];
  dividerFileIds: string[];
  metrics: SmartUploadMetric[];
  warnings: string[];
  error?: string;
  expectedFileCount: number;
  confirmedFileCount: number;
};

type UploadSession = {
  sessionId: string;
  reportId?: string;
  jobId: string;
  status?: string;
  resumed?: boolean;
  alreadyQueued?: boolean;
  processed?: boolean;
  readyToComplete?: boolean;
  files: SmartUploadTarget[];
  nextCursor?: string | null;
};

type TargetPage = {
  files: SmartUploadTarget[];
  cursor: number;
  nextCursor: string | null;
  total: number;
};

const GROUPING_POLL_INTERVAL_MS = 1_250;

function endpointFor(kind: SmartUploadKind): SmartUploadEndpoint {
  return kind === "asset" ? "/asset" : "/lot-listing";
}

function createManifest(files: SmartUploadDraft["files"]) {
  return files.map((item) => ({
    fileId: item.fileId,
    name: item.name,
    type: item.type || "application/octet-stream",
    size: item.size,
    fieldname: "images",
    imageIndex: item.originalOrder,
    captureOrder: item.originalOrder,
    originalOrder: item.originalOrder,
    role: "main",
  }));
}

function unwrapMessage(error: unknown, fallback: string) {
  const candidate = error as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };
  return (
    candidate?.response?.data?.message ||
    candidate?.response?.data?.error ||
    candidate?.message ||
    fallback
  );
}

export function getSmartUploadError(error: unknown) {
  return unwrapMessage(error, "Smart Upload could not continue.");
}

export async function createOrResumeSmartUploadSession(
  draft: SmartUploadDraft
) {
  const endpoint = endpointFor(draft.kind);
  const { data: envelope } = await API.post<{ data: UploadSession }>(
    `${endpoint}/upload-session`,
    {
      details: {
        ...draft.details,
        smart_upload: true,
        grouping_mode: "mixed",
        client_submission_id: draft.clientSubmissionId,
        progress_id: draft.clientSubmissionId,
      },
      files: createManifest(draft.files),
    }
  );
  return envelope.data;
}

async function fetchTargetPage(
  endpoint: SmartUploadEndpoint,
  sessionId: string,
  cursor: string
) {
  const { data: envelope } = await API.get<{ data: TargetPage }>(
    `${endpoint}/upload-session/${sessionId}/targets`,
    { params: { cursor, limit: 100 } }
  );
  return envelope.data;
}

async function confirmTargetPage(
  endpoint: SmartUploadEndpoint,
  sessionId: string,
  fileIds: string[]
) {
  await API.post(`${endpoint}/upload-session/${sessionId}/confirm-files`, {
    fileIds,
  });
}

export async function uploadSmartUploadFiles(args: {
  draft: SmartUploadDraft;
  session: UploadSession;
  onProgress: (progress: {
    uploadedBytes: number;
    totalBytes: number;
    uploadedFiles: number;
    totalFiles: number;
  }) => void;
  onFilesConfirmed: (files: SmartUploadStoredFile[]) => Promise<void>;
}) {
  const endpoint = endpointFor(args.draft.kind);
  const descriptorById = new Map(
    args.draft.files.map((item) => [item.fileId, item])
  );
  const stateById = new Map(
    args.draft.files.map((item) => [
      item.fileId,
      {
        fileId: item.fileId,
        name: item.name,
        type: item.type,
        size: item.size,
        lastModified: item.lastModified,
        originalOrder: item.originalOrder,
        uploaded: item.uploaded,
      } satisfies SmartUploadStoredFile,
    ])
  );
  const totalBytes =
    args.draft.files.reduce((sum, item) => sum + Math.max(1, item.size), 0) ||
    1;
  let uploadedBytes = args.draft.files.reduce(
    (sum, item) => sum + (item.uploaded ? Math.max(1, item.size) : 0),
    0
  );
  let uploadedFiles = args.draft.files.filter((item) => item.uploaded).length;

  const publishProgress = () =>
    args.onProgress({
      uploadedBytes,
      totalBytes,
      uploadedFiles,
      totalFiles: args.draft.files.length,
    });
  publishProgress();

  let page: Pick<TargetPage, "files" | "nextCursor"> = {
    files: args.session.files || [],
    nextCursor: args.session.nextCursor || null,
  };

  while (page.files.length) {
    const pageLoaded = new Map<string, number>();
    await mapWithConcurrency(
      page.files,
      async (target) => {
        const item = descriptorById.get(target.fileId);
        if (!item) {
          throw new Error(`Upload file ${target.fileId} is missing locally.`);
        }
        if (stateById.get(target.fileId)?.uploaded) return;
        let lastLoaded = 0;
        await uploadFileToReportSession({
          endpoint,
          sessionId: args.session.sessionId,
          fileId: target.fileId,
          uploadUrl: target.uploadUrl,
          file: item.file,
          contentType: target.contentType,
          onDelta: (delta) => {
            // Retries restart XHR progress at zero, so cap the accumulated
            // contribution at the source file size.
            lastLoaded = Math.min(item.size, lastLoaded + delta);
            pageLoaded.set(target.fileId, lastLoaded);
            const activeBytes = [...pageLoaded.values()].reduce(
              (sum, value) => sum + value,
              0
            );
            args.onProgress({
              uploadedBytes: Math.min(totalBytes, uploadedBytes + activeBytes),
              totalBytes,
              uploadedFiles,
              totalFiles: args.draft.files.length,
            });
          },
        });
        // Server fallback does not expose XHR progress. Mark its contribution
        // complete only after the authenticated upload returns successfully.
        pageLoaded.set(target.fileId, item.size);
      },
      DIRECT_UPLOAD_CONCURRENCY
    );

    const pageIds = page.files.map((target) => target.fileId);
    await confirmTargetPage(endpoint, args.session.sessionId, pageIds);
    for (const fileId of pageIds) {
      const state = stateById.get(fileId);
      if (!state || state.uploaded) continue;
      state.uploaded = true;
      uploadedBytes += Math.max(1, state.size);
      uploadedFiles += 1;
    }
    pageLoaded.clear();
    const nextFiles = [...stateById.values()].sort(
      (left, right) => left.originalOrder - right.originalOrder
    );
    await args.onFilesConfirmed(nextFiles);
    publishProgress();

    if (!page.nextCursor) break;
    page = await fetchTargetPage(
      endpoint,
      args.session.sessionId,
      page.nextCursor
    );
  }
}

export async function startSmartUploadDetection(
  kind: SmartUploadKind,
  sessionId: string
) {
  const { data: envelope } = await API.post<{ data: SmartUploadGrouping }>(
    `${endpointFor(kind)}/upload-session/${sessionId}/detect-dividers`,
    {}
  );
  return envelope.data;
}

export async function getSmartUploadGrouping(
  kind: SmartUploadKind,
  sessionId: string
) {
  const { data: envelope } = await API.get<{ data: SmartUploadGrouping }>(
    `${endpointFor(kind)}/upload-session/${sessionId}/smart-grouping`
  );
  return envelope.data;
}

export async function waitForSmartUploadGrouping(args: {
  kind: SmartUploadKind;
  sessionId: string;
  signal?: AbortSignal;
  onProgress?: (grouping: SmartUploadGrouping) => void;
}) {
  while (!args.signal?.aborted) {
    const grouping = await getSmartUploadGrouping(args.kind, args.sessionId);
    args.onProgress?.(grouping);
    if (
      grouping.groupingStatus === "review_ready" ||
      grouping.groupingStatus === "confirmed"
    ) {
      return grouping;
    }
    if (grouping.groupingStatus === "failed") {
      throw new Error(
        grouping.error || "Black-image separator detection failed."
      );
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, GROUPING_POLL_INTERVAL_MS);
      args.signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout);
          reject(new DOMException("Smart Upload polling was cancelled.", "AbortError"));
        },
        { once: true }
      );
    });
  }
  throw new DOMException("Smart Upload polling was cancelled.", "AbortError");
}

export async function updateSmartUploadDividers(args: {
  kind: SmartUploadKind;
  sessionId: string;
  dividerFileIds: string[];
  confirm?: boolean;
}) {
  const { data: envelope } = await API.patch<{ data: SmartUploadGrouping }>(
    `${endpointFor(args.kind)}/upload-session/${args.sessionId}/smart-grouping`,
    {
      dividerFileIds: args.dividerFileIds,
      confirm: args.confirm === true,
    }
  );
  return envelope.data;
}

export async function completeSmartUpload(
  kind: SmartUploadKind,
  sessionId: string
) {
  const { data } = await API.post(
    `${endpointFor(kind)}/upload-session/${sessionId}/complete`,
    {}
  );
  return data as {
    message: string;
    jobId: string;
    reportId: string;
    status: string;
    phase: string;
  };
}

export async function cancelSmartUpload(
  kind: SmartUploadKind,
  sessionId: string
) {
  await API.delete(`${endpointFor(kind)}/upload-session/${sessionId}`);
}
