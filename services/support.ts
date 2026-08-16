import API from "@/lib/api";
import { SERVER_BASE } from "@/lib/config";
import type { SafeSupportDiagnostics } from "@/lib/supportDiagnostics";
import {
  DEFAULT_SUPPORT_FILE_LIMITS,
  supportFileContentType,
  type SupportFileLimits,
} from "@/lib/supportFiles";
import {
  mapWithConcurrency,
  putFileWithRetry,
} from "@/services/directUpload";

export type SupportCategory = "error" | "feature" | "question" | "other";
export type SupportStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
export type SupportSenderRole = "user" | "support" | "system";

export type SupportAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  url?: string;
  status: "ready";
  createdAt?: string;
};

export type SupportMessage = {
  id: string;
  conversationId?: string;
  body: string;
  senderRole: SupportSenderRole;
  senderName?: string;
  clientMessageId?: string;
  attachments: SupportAttachment[];
  createdAt: string;
};

export type SupportConversation = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  source: "web" | "mobile";
  preview?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
};

export type SupportPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CreateSupportConversationInput = {
  subject: string;
  category: SupportCategory;
  message: string;
  diagnostics?: SafeSupportDiagnostics;
};

export type SendSupportMessageInput = {
  body: string;
  clientMessageId: string;
  attachmentIds?: string[];
};

export type SupportUploadFailure = {
  file: File;
  message: string;
};

export type SupportUploadResult = {
  attachmentIds: string[];
  failures: SupportUploadFailure[];
};

type SupportUploadTarget = {
  attachmentId: string;
  uploadUrl: string;
  contentType: string;
  headers?: Record<string, string>;
};

const SUPPORT_UPLOAD_CONCURRENCY = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asDate(value: unknown, fallback = new Date(0).toISOString()) {
  const candidate = asString(value);
  if (!candidate) return fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function unwrap(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.prototype.hasOwnProperty.call(value, "data")
    ? value.data
    : value;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
) {
  const candidate = asString(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

const CATEGORIES: readonly SupportCategory[] = [
  "error",
  "feature",
  "question",
  "other",
];
const STATUSES: readonly SupportStatus[] = [
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
];
const PRIORITIES: readonly SupportPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

function normalizeSenderRole(value: unknown): SupportSenderRole {
  const candidate = asString(value).toLowerCase();
  if (candidate === "system") return "system";
  if (["support", "developer", "admin", "agent", "staff"].includes(candidate)) {
    return "support";
  }
  return "user";
}

function attachmentUrl(value: unknown) {
  const candidate = asString(value);
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("blob:")) {
    return candidate;
  }
  return `${SERVER_BASE}${candidate.startsWith("/") ? "" : "/"}${candidate}`;
}

export function normalizeSupportAttachment(
  value: unknown
): SupportAttachment | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id || value._id || value.attachmentId);
  if (!id) return null;
  const url = attachmentUrl(
    value.url || value.downloadUrl || value.publicUrl || value.fileUrl
  );
  const rawStatus = asString(value.status).toLowerCase();
  // A URL is only renderable after the backend has verified the object in R2.
  // Older DTOs without a status remain tolerated, but an explicit pending or
  // failed state always wins even if a stale URL is present.
  const ready = rawStatus
    ? rawStatus === "ready" || rawStatus === "confirmed"
    : Boolean(value.confirmedAt) || Boolean(url);
  if (!ready) return null;

  return {
    id,
    fileName: asString(
      value.fileName || value.filename || value.originalName || value.name,
      "Attachment"
    ),
    contentType: asString(
      value.contentType || value.mimeType || value.type,
      "application/octet-stream"
    ),
    size: Math.max(0, Number(value.sizeBytes || value.size) || 0),
    url,
    status: "ready",
    createdAt: asString(value.createdAt) || undefined,
  };
}

export function normalizeSupportMessage(value: unknown): SupportMessage | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id || value._id || value.messageId);
  if (!id) return null;
  const sender = isRecord(value.sender)
    ? value.sender
    : isRecord(value.author)
      ? value.author
      : undefined;
  const rawAttachments = Array.isArray(value.attachments)
    ? value.attachments
    : [];

  return {
    id,
    conversationId:
      asString(value.conversationId || value.conversation) || undefined,
    body: asString(value.body || value.message || value.text || value.content),
    senderRole: normalizeSenderRole(
      value.senderRole || value.senderType || value.authorRole || sender?.role
    ),
    senderName:
      asString(
        value.senderName ||
          value.authorName ||
          sender?.name ||
          sender?.username ||
          sender?.email
      ) || undefined,
    clientMessageId: asString(value.clientMessageId) || undefined,
    attachments: rawAttachments.flatMap((attachment) => {
      const normalized = normalizeSupportAttachment(attachment);
      return normalized ? [normalized] : [];
    }),
    createdAt: asDate(value.createdAt || value.sentAt),
  };
}

export function normalizeSupportConversation(
  value: unknown
): SupportConversation | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id || value._id || value.conversationId);
  if (!id) return null;
  const latest = isRecord(value.lastMessage)
    ? value.lastMessage
    : isRecord(value.latestMessage)
      ? value.latestMessage
      : undefined;
  const createdAt = asDate(value.createdAt);
  const updatedAt = asDate(value.updatedAt, createdAt);

  return {
    id,
    subject: asString(value.subject || value.title, "Support request"),
    category: enumValue(value.category, CATEGORIES, "other"),
    status: enumValue(value.status, STATUSES, "open"),
    priority: enumValue(value.priority, PRIORITIES, "normal"),
    source: enumValue(value.source, ["web", "mobile"] as const, "web"),
    preview:
      asString(
        value.preview || value.lastMessagePreview || latest?.preview || latest?.body
      ) ||
      undefined,
    unreadCount: Math.max(
      0,
      Number(
        value.unreadCount ||
          (isRecord(value.unread) ? value.unread.user : undefined)
      ) || 0
    ),
    createdAt,
    updatedAt,
    lastMessageAt:
      asString(value.lastMessageAt || latest?.at || latest?.createdAt) ||
      undefined,
  };
}

function normalizePage<T>(
  value: unknown,
  itemKeys: readonly string[],
  normalizeItem: (item: unknown) => T | null
): SupportPage<T> {
  const envelope = isRecord(value) ? value : {};
  const payload = unwrap(value);
  const record = isRecord(payload) ? payload : {};
  let candidates: unknown[] = Array.isArray(payload) ? payload : [];
  if (!candidates.length) {
    for (const key of ["items", ...itemKeys]) {
      if (Array.isArray(record[key])) {
        candidates = record[key] as unknown[];
        break;
      }
    }
  }
  const pagination = isRecord(record.pagination) ? record.pagination : {};
  const envelopePagination = isRecord(envelope.pagination)
    ? envelope.pagination
    : {};
  const nextCursor = asString(
    record.nextCursor ||
      pagination.nextCursor ||
      envelope.nextCursor ||
      envelopePagination.nextCursor
  );
  return {
    items: candidates.flatMap((candidate) => {
      const normalized = normalizeItem(candidate);
      return normalized ? [normalized] : [];
    }),
    nextCursor: nextCursor || null,
  };
}

function errorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as {
    response?: { data?: { message?: unknown; error?: unknown } };
  })?.response?.data;
  return (
    asString(responseMessage?.message || responseMessage?.error) ||
    (error instanceof Error && error.message ? error.message : fallback)
  );
}

function normalizeUploadTargets(value: unknown): SupportUploadTarget[] {
  const payload = unwrap(value);
  const record = isRecord(payload) ? payload : {};
  const singleAttachment = isRecord(record.attachment)
    ? record.attachment
    : undefined;
  const singleUpload = isRecord(record.upload) ? record.upload : undefined;
  const candidates = singleAttachment && singleUpload
    ? [{ ...singleAttachment, upload: singleUpload }]
    : Array.isArray(payload)
    ? payload
    : Array.isArray(record.attachments)
      ? record.attachments
      : Array.isArray(record.files)
        ? record.files
        : Array.isArray(record.targets)
          ? record.targets
          : [];

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const upload = isRecord(candidate.upload) ? candidate.upload : candidate;
    const attachmentId = asString(
      candidate.attachmentId || candidate.id || candidate._id
    );
    const uploadUrl = asString(
      upload.url || upload.uploadUrl || upload.presignedUrl
    );
    if (!attachmentId || !uploadUrl) return [];
    const rawHeaders = isRecord(upload.headers) ? upload.headers : {};
    const headers = Object.fromEntries(
      Object.entries(rawHeaders).flatMap(([name, headerValue]) =>
        typeof headerValue === "string" ? [[name, headerValue]] : []
      )
    );
    return [
      {
        attachmentId,
        uploadUrl,
        contentType: asString(
          candidate.contentType || candidate.mimeType || rawHeaders["Content-Type"],
          "application/octet-stream"
        ),
        headers,
      },
    ];
  });
}

export const SupportService = {
  async getUploadConstraints(): Promise<SupportFileLimits> {
    const { data } = await API.get("/support/constraints");
    const payload = unwrap(data);
    const record = isRecord(payload)
      ? isRecord(payload.constraints)
        ? payload.constraints
        : payload
      : {};
    const imageContentTypes = Array.isArray(record.imageContentTypes)
      ? record.imageContentTypes.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const videoContentTypes = Array.isArray(record.videoContentTypes)
      ? record.videoContentTypes.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const positive = (value: unknown, fallback: number) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
      imageContentTypes:
        imageContentTypes.length > 0
          ? imageContentTypes
          : DEFAULT_SUPPORT_FILE_LIMITS.imageContentTypes,
      videoContentTypes:
        videoContentTypes.length > 0
          ? videoContentTypes
          : DEFAULT_SUPPORT_FILE_LIMITS.videoContentTypes,
      maxImageBytes: positive(
        record.maxImageBytes,
        DEFAULT_SUPPORT_FILE_LIMITS.maxImageBytes
      ),
      maxVideoBytes: positive(
        record.maxVideoBytes,
        DEFAULT_SUPPORT_FILE_LIMITS.maxVideoBytes
      ),
      maxAttachmentsPerMessage: positive(
        record.maxAttachmentsPerMessage,
        DEFAULT_SUPPORT_FILE_LIMITS.maxAttachmentsPerMessage
      ),
      maxPendingUploads: positive(
        record.maxPendingUploads,
        DEFAULT_SUPPORT_FILE_LIMITS.maxPendingUploads
      ),
    };
  },

  async listConversations(cursor?: string): Promise<SupportPage<SupportConversation>> {
    const { data } = await API.get("/support/conversations", {
      params: { limit: 50, ...(cursor ? { cursor } : {}) },
    });
    return normalizePage(data, ["conversations"], normalizeSupportConversation);
  },

  async getConversation(id: string): Promise<SupportConversation> {
    const { data } = await API.get(
      `/support/conversations/${encodeURIComponent(id)}`
    );
    const payload = unwrap(data);
    const normalized = normalizeSupportConversation(
      isRecord(payload) ? payload.conversation || payload : payload
    );
    if (!normalized) throw new Error("Support returned an invalid conversation.");
    return normalized;
  },

  async createConversation(
    input: CreateSupportConversationInput
  ): Promise<SupportConversation> {
    const { data } = await API.post("/support/conversations", {
      subject: input.subject,
      category: input.category,
      source: "web",
      message: input.message,
      diagnostics: input.diagnostics,
    });
    const payload = unwrap(data);
    const normalized = normalizeSupportConversation(
      isRecord(payload) ? payload.conversation || payload : payload
    );
    if (!normalized) throw new Error("Support returned an invalid conversation.");
    return normalized;
  },

  async listMessages(
    conversationId: string,
    cursor?: string
  ): Promise<SupportPage<SupportMessage>> {
    const { data } = await API.get(
      `/support/conversations/${encodeURIComponent(conversationId)}/messages`,
      { params: { limit: 50, ...(cursor ? { before: cursor } : {}) } }
    );
    return normalizePage(data, ["messages"], normalizeSupportMessage);
  },

  async sendMessage(
    conversationId: string,
    input: SendSupportMessageInput
  ): Promise<SupportMessage> {
    const { data } = await API.post(
      `/support/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        body: input.body,
        clientMessageId: input.clientMessageId,
        attachmentIds: input.attachmentIds?.length
          ? input.attachmentIds
          : undefined,
      }
    );
    const payload = unwrap(data);
    const normalized = normalizeSupportMessage(
      isRecord(payload) ? payload.message || payload : payload
    );
    if (!normalized) throw new Error("Support returned an invalid message.");
    return normalized;
  },

  async markRead(conversationId: string): Promise<void> {
    await API.post(
      `/support/conversations/${encodeURIComponent(conversationId)}/read`,
      {}
    );
  },

  async uploadAttachments(
    conversationId: string,
    files: File[],
    onProgress?: (fraction: number) => void
  ): Promise<SupportUploadResult> {
    if (!files.length) return { attachmentIds: [], failures: [] };
    const totalBytes =
      files.reduce((total, file) => total + Math.max(1, file.size), 0) || 1;
    let uploadedBytes = 0;
    const loadedByIndex = new Map<number, number>();
    const attachmentIds: string[] = [];
    const failures: SupportUploadFailure[] = [];

    await mapWithConcurrency(
      files,
      async (file, index) => {
        try {
          const { data } = await API.post(
            `/support/conversations/${encodeURIComponent(conversationId)}/attachments/presign`,
            {
              fileName: file.name,
              contentType:
                supportFileContentType(file) || "application/octet-stream",
              sizeBytes: file.size,
            }
          );
          const target = normalizeUploadTargets(data)[0];
          if (!target) {
            throw new Error(
              "The server did not return a valid upload target for this file."
            );
          }
          let putError: unknown;
          try {
            await putFileWithRetry(
              target.uploadUrl,
              file,
              target.contentType || supportFileContentType(file),
              (delta) => {
                const previous = loadedByIndex.get(index) || 0;
                const next = Math.min(file.size, previous + Math.max(0, delta));
                loadedByIndex.set(index, next);
                uploadedBytes += Math.max(0, next - previous);
                onProgress?.(Math.min(0.95, uploadedBytes / totalBytes));
              },
              target.headers
            );
          } catch (error) {
            putError = error;
          }

          try {
            // A browser timeout or 412 can mean the first no-overwrite PUT
            // landed but its response was lost. Confirmation HEAD-checks R2,
            // so it is the authoritative result and prevents duplicate files.
            await API.post(
              `/support/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(target.attachmentId)}/confirm`,
              {}
            );
          } catch (confirmError) {
            if (putError) {
              throw new Error(
                `${errorMessage(putError, "R2 upload failed")} ${errorMessage(
                  confirmError,
                  "The uploaded file could not be confirmed."
                )}`
              );
            }
            throw confirmError;
          }
          attachmentIds.push(target.attachmentId);
        } catch (error) {
          failures.push({
            file,
            message: errorMessage(error, `Unable to upload ${file.name}.`),
          });
        }
      },
      SUPPORT_UPLOAD_CONCURRENCY
    );

    onProgress?.(1);
    return { attachmentIds, failures };
  },
};
