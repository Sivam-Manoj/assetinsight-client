import API from "@/lib/api";

export type DirectUploadFile = {
  file: File;
  fieldname?: "images" | "videos";
  lotIndex?: number;
  imageIndex?: number;
  captureOrder?: number;
  originalOrder?: number;
  role?: "main" | "extra" | "video";
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
  files: Array<{
    fileId: string;
    uploadUrl: string;
    method: "PUT";
    contentType: string;
  }>;
};

export const DIRECT_UPLOAD_CONCURRENCY = 4;
const DIRECT_UPLOAD_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const delta = Math.max(0, event.loaded - lastLoaded);
      lastLoaded = event.loaded;
      onDelta?.(delta);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const delta = Math.max(0, file.size - lastLoaded);
        if (delta) onDelta?.(delta);
        resolve();
      } else {
        const detail = xhr.responseText?.trim().replace(/\s+/g, " ").slice(0, 180);
        reject(new Error(`R2 upload failed for ${file.name} (${xhr.status})${detail ? `: ${detail}` : ""}`));
      }
    };
    xhr.onerror = () => reject(new Error(`R2 upload failed for ${file.name}`));
    xhr.send(file);
  });
}

async function uploadFileThroughServerFallback(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  fileId: string,
  file: File
) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  await API.post(
    `${endpoint}/upload-session/${sessionId}/files/${encodeURIComponent(fileId)}`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300000,
    }
  );
}

export async function putFileWithRetry(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DIRECT_UPLOAD_RETRIES; attempt += 1) {
    try {
      await putFileWithProgress(url, file, contentType, onDelta);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < DIRECT_UPLOAD_RETRIES) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function mapWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = DIRECT_UPLOAD_CONCURRENCY
) {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) break;
        await worker(items[index], index);
      }
    })
  );
}

export async function uploadReportFilesDirectToR2(args: {
  endpoint: "/asset" | "/lot-listing";
  details: Record<string, any>;
  files: DirectUploadFile[];
  onUploadProgress?: (fraction: number) => void;
}) {
  const totalBytes = args.files.reduce((sum, item) => sum + (item.file.size || 1), 0) || 1;
  let uploadedBytes = 0;
  const manifest = args.files.map((item, index) => ({
    // Keep file ids deterministic so create/complete can be retried safely.
    fileId: `${item.fieldname || "images"}-${index}`,
    name: item.file.name || `${item.fieldname || "image"}-${index + 1}`,
    type: item.file.type || "application/octet-stream",
    size: item.file.size,
    fieldname: item.fieldname || "images",
    lotIndex: item.lotIndex,
    imageIndex: item.imageIndex ?? index,
    captureOrder: item.captureOrder ?? item.originalOrder ?? index,
    originalOrder: item.originalOrder ?? item.captureOrder ?? index,
    role: item.role || (item.fieldname === "videos" ? "video" : "main"),
  }));

  const { data: sessionEnvelope } = await API.post<{ data: UploadSession }>(
    `${args.endpoint}/upload-session`,
    {
      details: args.details,
      files: manifest,
    }
  );
  const session = sessionEnvelope.data;
  if (session.alreadyQueued && session.reportId) {
    args.onUploadProgress?.(1);
    return {
      message: "Submission already accepted and is being processed.",
      jobId: session.jobId,
      reportId: session.reportId,
      status: session.status || "processing",
      phase: session.processed || session.status === "processed" ? "done" : "processing",
      resumed: true,
    };
  }
  const targetById = new Map(session.files.map((file) => [file.fileId, file]));

  if (!session.readyToComplete) {
    await mapWithConcurrency(args.files, async (item, index) => {
      const target = targetById.get(manifest[index].fileId);
      if (!target) throw new Error(`Missing upload target for ${item.file.name}`);
      try {
        await putFileWithRetry(target.uploadUrl, item.file, target.contentType, (delta) => {
          uploadedBytes += delta;
          args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
        });
      } catch (directUploadError) {
        // Browser direct PUT requests may be blocked by R2 CORS or a corporate
        // network. Upload only this failed file through the authenticated API,
        // keeping the same session/key and avoiding a duplicate report.
        await uploadFileThroughServerFallback(
          args.endpoint,
          session.sessionId,
          manifest[index].fileId,
          item.file
        ).catch((fallbackError) => {
          const directMessage = directUploadError instanceof Error ? directUploadError.message : "Direct R2 upload failed";
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Server fallback upload failed";
          throw new Error(`${directMessage}. ${fallbackMessage}`);
        });
        uploadedBytes += item.file.size || 1;
        args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
      }
    });
  }

  args.onUploadProgress?.(0.95);
  const { data } = await API.post(`${args.endpoint}/upload-session/${session.sessionId}/complete`, {});
  args.onUploadProgress?.(1);
  return data;
}
