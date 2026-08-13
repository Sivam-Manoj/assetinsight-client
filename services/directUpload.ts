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
    headers?: Record<string, string>;
  }>;
};

export const DIRECT_UPLOAD_CONCURRENCY = 4;
const DIRECT_UPLOAD_RETRIES = 2;
const SERVER_FALLBACK_RETRIES = 2;
const DIRECT_UPLOAD_CIRCUIT_TTL_MS = 10 * 60 * 1000;
const CLOUDFLARE_R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let serverFallbackQueue: Promise<void> = Promise.resolve();
const directUploadUnavailableUntil = new Map<string, number>();

function directUploadHost(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function canUseDirectBrowserUpload(url: string) {
  try {
    // Cloudflare's standard R2 endpoint rejects browser PUT preflights unless
    // the bucket has an explicit CORS policy. Keep uploads working through the
    // authenticated API. This safety rule intentionally wins over a stale
    // NEXT_PUBLIC_DIRECT_R2_UPLOAD build flag: production must not strand a
    // whole selection in repeated, browser-blocked preflights.
    if (
      new URL(url).hostname
        .toLowerCase()
        .endsWith(CLOUDFLARE_R2_HOST_SUFFIX)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const configured = process.env.NEXT_PUBLIC_DIRECT_R2_UPLOAD;
  if (configured === "false") return false;
  return true;
}

function directUploadIsUnavailable(url: string) {
  const host = directUploadHost(url);
  const unavailableUntil = directUploadUnavailableUntil.get(host) || 0;
  if (unavailableUntil > Date.now()) return true;
  directUploadUnavailableUntil.delete(host);
  return false;
}

function markDirectUploadUnavailable(url: string) {
  directUploadUnavailableUntil.set(
    directUploadHost(url),
    Date.now() + DIRECT_UPLOAD_CIRCUIT_TTL_MS
  );
}

export function resetDirectUploadCircuitBreakerForTests() {
  directUploadUnavailableUntil.clear();
}

async function withServerFallbackSlot<T>(task: () => Promise<T>): Promise<T> {
  const previous = serverFallbackQueue;
  let release!: () => void;
  serverFallbackQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

const uploadErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as any)?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage.trim();
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const isRetryableServerUploadError = (error: unknown) => {
  const status = Number((error as any)?.response?.status || 0);
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
};

export function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void,
  headers?: Record<string, string>
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");
    for (const [name, value] of Object.entries(headers || {})) {
      if (name.toLowerCase() === "content-type") continue;
      xhr.setRequestHeader(name, value);
    }
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

export async function uploadFileThroughServerFallback(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  fileId: string,
  file: File
) {
  await withServerFallbackSlot(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SERVER_FALLBACK_RETRIES; attempt += 1) {
      const formData = new FormData();
      formData.append("file", file, file.name);
      try {
        await API.post(
          `${endpoint}/upload-session/${sessionId}/files/${encodeURIComponent(fileId)}`,
          formData,
          {
            // Let the browser/Axios add the multipart boundary. Setting
            // Content-Type manually can produce an incomplete form body behind
            // some proxies.
            timeout: 300000,
          }
        );
        return;
      } catch (error) {
        lastError = error;
        if (
          attempt >= SERVER_FALLBACK_RETRIES ||
          !isRetryableServerUploadError(error)
        ) {
          throw error;
        }
        await sleep(750 * (attempt + 1));
      }
    }
    throw lastError;
  });
}

export async function verifyUploadSessionFile(
  endpoint: "/asset" | "/lot-listing",
  sessionId: string,
  fileId: string
) {
  const { data } = await API.post(
    `${endpoint}/upload-session/${sessionId}/files/${encodeURIComponent(fileId)}/verify`,
    {}
  );
  return data?.data?.verified === true;
}

export async function uploadFileToReportSession(args: {
  endpoint: "/asset" | "/lot-listing";
  sessionId: string;
  fileId: string;
  uploadUrl: string;
  file: File;
  contentType: string;
  headers?: Record<string, string>;
  onDelta?: (delta: number) => void;
}) {
  if (
    !canUseDirectBrowserUpload(args.uploadUrl) ||
    directUploadIsUnavailable(args.uploadUrl)
  ) {
    await uploadFileThroughServerFallback(
      args.endpoint,
      args.sessionId,
      args.fileId,
      args.file
    );
    return { transport: "server" as const };
  }

  try {
    await putFileWithRetry(
      args.uploadUrl,
      args.file,
      args.contentType,
      args.onDelta,
      args.headers
    );
    return { transport: "direct" as const };
  } catch (directUploadError) {
    // R2 may accept the PUT but hide the response from the browser when its
    // CORS policy is absent or stale. A small authenticated HEAD check avoids
    // uploading the same multi-megabyte photo through the API unnecessarily.
    try {
      const verified = await verifyUploadSessionFile(
        args.endpoint,
        args.sessionId,
        args.fileId
      );
      if (verified) return { transport: "direct-verified" as const };
    } catch {
      // A missing object or an older API without the verification endpoint
      // should continue to the compatible server upload path.
    }

    // A failed PUT followed by a failed object verification normally means the
    // storage host is unavailable to this browser (most often a missing R2
    // CORS rule). Remember that briefly so a large report does not repeat the
    // same doomed retries for every remaining photo.
    markDirectUploadUnavailable(args.uploadUrl);

    try {
      // Preserve the original session and R2 object key. This is a transport
      // fallback only and cannot create a duplicate report or reorder files.
      await uploadFileThroughServerFallback(
        args.endpoint,
        args.sessionId,
        args.fileId,
        args.file
      );
      return { transport: "server" as const };
    } catch (fallbackError) {
      const directMessage = uploadErrorMessage(
        directUploadError,
        "Direct R2 upload failed"
      );
      const fallbackMessage = uploadErrorMessage(
        fallbackError,
        "Server fallback upload failed"
      );
      throw new Error(`${directMessage}. ${fallbackMessage}`);
    }
  }
}

export async function putFileWithRetry(
  url: string,
  file: File,
  contentType: string,
  onDelta?: (delta: number) => void,
  headers?: Record<string, string>
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DIRECT_UPLOAD_RETRIES; attempt += 1) {
    try {
      await putFileWithProgress(url, file, contentType, onDelta, headers);
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
      let fileLoaded = 0;
      await uploadFileToReportSession({
        endpoint: args.endpoint,
        sessionId: session.sessionId,
        fileId: manifest[index].fileId,
        uploadUrl: target.uploadUrl,
        file: item.file,
        contentType: target.contentType,
        headers: target.headers,
        onDelta: (delta) => {
          const nextLoaded = Math.min(item.file.size, fileLoaded + delta);
          uploadedBytes += Math.max(0, nextLoaded - fileLoaded);
          fileLoaded = nextLoaded;
          args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
        },
      });
      // Direct progress events may be unavailable, and server fallback has no
      // browser upload progress. Count the file as complete exactly once.
      if (fileLoaded < item.file.size) {
        uploadedBytes += item.file.size - fileLoaded;
        fileLoaded = item.file.size;
        args.onUploadProgress?.(Math.max(0, Math.min(0.9, uploadedBytes / totalBytes)));
      }
    });
  }

  args.onUploadProgress?.(0.95);
  const { data } = await API.post(`${args.endpoint}/upload-session/${session.sessionId}/complete`, {});
  args.onUploadProgress?.(1);
  return data;
}
