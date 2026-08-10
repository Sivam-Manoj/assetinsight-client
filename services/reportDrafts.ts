import API from "@/lib/api";

export type ReportDraftKind = "asset" | "lot-listing";
export type ReportDraftApiType = "asset" | "lotListing";
export type ReportDraftStorageMode = "local_media" | "smart_upload";

export type ReportDraftMediaDescriptor = {
  clientFileId: string;
  localKey?: string;
  lotId?: string;
  slot: "main" | "extra" | "video";
  index: number;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

export type SmartUploadServerFile = {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  originalOrder: number;
};

export type SmartUploadDraftSummary = {
  sessionId?: string;
  groupingStatus:
    | "uploading"
    | "classifying"
    | "review_ready"
    | "confirmed"
    | "failed";
  progressPercent: number;
  files?: SmartUploadServerFile[];
  groups: Array<{
    groupIndex: number;
    imageCount: number;
    fileIds: string[];
    overLimit: boolean;
    files?: SmartUploadServerFile[];
  }>;
  dividerFileIds?: string[];
  warnings?: string[];
  error?: string;
  expectedFileCount?: number;
  confirmedFileCount?: number;
};

export type ReportDraftRecord = {
  _id: string;
  id?: string;
  user: string;
  clientDraftId: string;
  type: ReportDraftApiType;
  storageMode: ReportDraftStorageMode;
  smartUploadSession?: string;
  revision: number;
  deviceId?: string;
  contractNo: string;
  title?: string;
  formData: Record<string, unknown>;
  lots: unknown[];
  activeLotIdx?: number;
  media: ReportDraftMediaDescriptor[];
  smartUploadSummary?: SmartUploadDraftSummary;
  createdAt: string;
  updatedAt: string;
};

export type UpsertReportDraftInput = {
  clientDraftId: string;
  kind: ReportDraftKind;
  storageMode?: ReportDraftStorageMode;
  smartUploadSessionId?: string;
  revision: number;
  deviceId?: string;
  contractNo?: string;
  title?: string;
  formData: Record<string, unknown>;
  lots: unknown[];
  activeLotIdx?: number;
  media?: ReportDraftMediaDescriptor[];
};

type DraftMediaLot = {
  id: string;
  files?: File[];
  extraFiles?: File[];
  videoFiles?: File[];
  [key: string]: unknown;
};

const DEVICE_ID_KEY = "cv_report_draft_device_id";

export function getReportDraftDeviceId() {
  if (typeof window === "undefined") return "server";
  let value = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!value) {
    value =
      globalThis.crypto?.randomUUID?.() ||
      `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, value);
  }
  return value;
}

export function createReportDraftClientId(kind: ReportDraftKind) {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function isBrowserMedia(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

/**
 * Mongo stores report text and small structural metadata only. Browser Blobs,
 * object URLs and legacy data URLs are deliberately excluded so a large draft
 * cannot exceed the API/body or Mongo document limits.
 */
export function sanitizeReportDraftMetadata<T>(value: T): T {
  const visit = (input: unknown): unknown => {
    if (isBrowserMedia(input)) return undefined;
    if (Array.isArray(input)) {
      return input
        .map(visit)
        .filter((item) => item !== undefined);
    }
    if (input instanceof Date) return input.toISOString();
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .map(([key, item]) => [key, visit(item)] as const)
          .filter(([, item]) => item !== undefined)
      );
    }
    if (
      typeof input === "string" &&
      (/^data:/i.test(input) || /^blob:/i.test(input))
    ) {
      return undefined;
    }
    return input;
  };
  return visit(value) as T;
}

function mediaDescriptor(
  lotId: string,
  slot: ReportDraftMediaDescriptor["slot"],
  file: File,
  index: number
): ReportDraftMediaDescriptor {
  const identity = [
    lotId,
    slot,
    index,
    file.name,
    file.size,
    file.lastModified || 0,
  ].join(":");
  return {
    clientFileId: identity,
    localKey: identity,
    lotId,
    slot,
    index,
    name: file.name || `${slot}-${index + 1}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified || 0,
  };
}

export function buildReportDraftMediaManifest(lots: DraftMediaLot[]) {
  return lots.flatMap((lot) => [
    ...(lot.files || []).map((file, index) =>
      mediaDescriptor(lot.id, "main", file, index)
    ),
    ...(lot.extraFiles || []).map((file, index) =>
      mediaDescriptor(lot.id, "extra", file, index)
    ),
    ...(lot.videoFiles || []).map((file, index) =>
      mediaDescriptor(lot.id, "video", file, index)
    ),
  ]);
}

/** Returns lot text/settings without embedding browser media bytes in Mongo. */
export function serializeReportDraftLots(lots: DraftMediaLot[]) {
  return lots.map((lot) => {
    const { files: _files, extraFiles: _extra, videoFiles: _videos, ...rest } =
      lot;
    return sanitizeReportDraftMetadata({
      ...rest,
      files: [],
      extraFiles: [],
      videoFiles: [],
    });
  });
}

const apiTypeFor = (kind: ReportDraftKind): ReportDraftApiType =>
  kind === "lot-listing" ? "lotListing" : "asset";

function unwrap<T>(response: { data: { data: T } }) {
  return response.data.data;
}

export const ReportDraftService = {
  async list(kind?: ReportDraftKind) {
    return unwrap(
      await API.get<{ data: ReportDraftRecord[] }>("/report-drafts", {
        params: kind ? { type: apiTypeFor(kind) } : undefined,
      })
    );
  },

  async get(id: string) {
    return unwrap(
      await API.get<{ data: ReportDraftRecord }>(`/report-drafts/${id}`)
    );
  },

  async getByClientId(clientDraftId: string, kind: ReportDraftKind) {
    return unwrap(
      await API.get<{ data: ReportDraftRecord }>(
        `/report-drafts/client/${encodeURIComponent(clientDraftId)}`,
        { params: { type: apiTypeFor(kind) } }
      )
    );
  },

  async upsert(input: UpsertReportDraftInput) {
    return unwrap(
      await API.post<{ data: ReportDraftRecord }>("/report-drafts", {
        ...input,
        type: apiTypeFor(input.kind),
        kind: undefined,
      })
    );
  },

  async delete(id: string) {
    await API.delete(`/report-drafts/${id}`);
  },

  async deleteByClientId(clientDraftId: string, kind: ReportDraftKind) {
    await API.delete(
      `/report-drafts/client/${encodeURIComponent(clientDraftId)}`,
      { params: { type: apiTypeFor(kind) } }
    );
  },
};

export function draftKindForRecord(record: ReportDraftRecord): ReportDraftKind {
  return record.type === "lotListing" ? "lot-listing" : "asset";
}
