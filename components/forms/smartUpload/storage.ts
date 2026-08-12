import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type SmartUploadKind = "asset" | "lot-listing";
export type SmartUploadStage =
  | "selected"
  | "uploading"
  | "classifying"
  | "review"
  | "submitting"
  | "failed";

export type SmartUploadStoredFile = {
  fileId: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  originalOrder: number;
  uploaded: boolean;
  url?: string;
};

export type SmartUploadDraftState = {
  version: 1;
  scope: string;
  userId: string;
  kind: SmartUploadKind;
  clientSubmissionId: string;
  sessionId?: string;
  stage: SmartUploadStage;
  details: Record<string, unknown>;
  files: SmartUploadStoredFile[];
  savedAt: string;
};

export type SmartUploadDraft = Omit<SmartUploadDraftState, "files"> & {
  files: Array<SmartUploadStoredFile & { file?: File }>;
};

type StoredSmartMedia = {
  id: string;
  scope: string;
  blob: Blob;
};

interface SmartUploadDatabase extends DBSchema {
  sessions: {
    key: string;
    value: SmartUploadDraftState;
  };
  media: {
    key: string;
    value: StoredSmartMedia;
    indexes: { "by-scope": string };
  };
}

const DATABASE_NAME = "clearvalue-smart-upload";
const DATABASE_VERSION = 1;
let databasePromise: Promise<IDBPDatabase<SmartUploadDatabase>> | null = null;
let persistenceRequested = false;

export function getSmartUploadScope(
  userId: string,
  kind: SmartUploadKind,
  scopeId?: string
) {
  const normalized = String(scopeId || "").trim();
  return `${userId}:${kind}${normalized ? `:${normalized}` : ""}`;
}

async function getDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error(
      "Smart Upload recovery storage is unavailable in this browser. Enable site storage and try again."
    );
  }
  if (!databasePromise) {
    databasePromise = openDB<SmartUploadDatabase>(
      DATABASE_NAME,
      DATABASE_VERSION,
      {
        upgrade(database) {
          database.createObjectStore("sessions", { keyPath: "scope" });
          const media = database.createObjectStore("media", { keyPath: "id" });
          media.createIndex("by-scope", "scope");
        },
      }
    ).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function requestPersistentStorage() {
  if (persistenceRequested || typeof navigator === "undefined") return;
  persistenceRequested = true;
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is advisory. IndexedDB remains usable when declined.
  }
}

export async function createSmartUploadDraft(args: {
  userId: string;
  kind: SmartUploadKind;
  scopeId?: string;
  clientSubmissionId: string;
  details: Record<string, unknown>;
  files: File[];
}): Promise<SmartUploadDraft> {
  await requestPersistentStorage();
  const database = await getDatabase();
  const scope = getSmartUploadScope(args.userId, args.kind, args.scopeId);
  const records: SmartUploadStoredFile[] = args.files.map((file, index) => ({
    fileId: `images-${index}`,
    name: file.name || `image-${index + 1}`,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified || 0,
    originalOrder: index,
    uploaded: false,
  }));
  const transaction = database.transaction(["sessions", "media"], "readwrite");
  const existingIds = await transaction.objectStore("media").index("by-scope").getAllKeys(scope);
  for (const id of existingIds) {
    await transaction.objectStore("media").delete(id);
  }
  const state: SmartUploadDraftState = {
    version: 1,
    scope,
    userId: args.userId,
    kind: args.kind,
    clientSubmissionId: args.clientSubmissionId,
    stage: "selected",
    details: args.details,
    files: records,
    savedAt: new Date().toISOString(),
  };
  // Queue each Blob write one at a time. Large Smart Upload selections can
  // contain hundreds of camera originals; scheduling every structured clone
  // concurrently creates a short-lived memory spike large enough to terminate
  // a mobile browser tab.
  for (let index = 0; index < args.files.length; index += 1) {
    const file = args.files[index];
    const record = records[index];
    await transaction.objectStore("media").put({
      id: `${scope}:${record.fileId}`,
      scope,
      blob: file,
    });
  }
  await transaction.objectStore("sessions").put(state);
  await transaction.done;
  // The picker already supplied these File objects. Returning the same
  // references avoids immediately reading and cloning every Blob back out of
  // IndexedDB after it was persisted.
  return {
    ...state,
    files: records.map((record, index) => ({
      ...record,
      file: args.files[index],
    })),
  };
}

export async function saveServerSmartUploadDraft(args: {
  userId: string;
  kind: SmartUploadKind;
  scopeId?: string;
  clientSubmissionId: string;
  sessionId: string;
  details: Record<string, unknown>;
  stage: SmartUploadStage;
  files: SmartUploadStoredFile[];
}): Promise<SmartUploadDraft> {
  const database = await getDatabase();
  const scope = getSmartUploadScope(args.userId, args.kind, args.scopeId);
  const state: SmartUploadDraftState = {
    version: 1,
    scope,
    userId: args.userId,
    kind: args.kind,
    clientSubmissionId: args.clientSubmissionId,
    sessionId: args.sessionId,
    stage: args.stage,
    details: args.details,
    files: args.files,
    savedAt: new Date().toISOString(),
  };
  await database.put("sessions", state);
  return { ...state, files: state.files.map((file) => ({ ...file })) };
}

export async function updateSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind,
  changes: Partial<
    Pick<
      SmartUploadDraftState,
      "sessionId" | "stage" | "details" | "files"
    >
  >,
  scopeId?: string
) {
  const database = await getDatabase();
  const scope = getSmartUploadScope(userId, kind, scopeId);
  const current = await database.get("sessions", scope);
  if (!current) throw new Error("The Smart Upload recovery session is missing.");
  const next: SmartUploadDraftState = {
    ...current,
    ...changes,
    scope,
    userId,
    kind,
    savedAt: new Date().toISOString(),
  };
  await database.put("sessions", next);
  return next;
}

export async function loadSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind,
  scopeId?: string
): Promise<SmartUploadDraft | null> {
  const database = await getDatabase();
  const state = await database.get(
    "sessions",
    getSmartUploadScope(userId, kind, scopeId)
  );
  // Keep resume lightweight. Upload workers load at most their concurrency
  // window of original Blobs below instead of cloning the entire selection
  // into page memory during workspace startup.
  return state
    ? { ...state, files: state.files.map((file) => ({ ...file })) }
    : null;
}

export async function loadSmartUploadFile(
  draft: Pick<SmartUploadDraftState, "scope">,
  descriptor: SmartUploadStoredFile
) {
  const database = await getDatabase();
  const media = await database.get(
    "media",
    `${draft.scope}:${descriptor.fileId}`
  );
  if (!media?.blob) return undefined;
  return new File([media.blob], descriptor.name, {
    type: descriptor.type || media.blob.type,
    lastModified: descriptor.lastModified,
  });
}

export async function releaseSmartUploadMedia(
  userId: string,
  kind: SmartUploadKind,
  scopeId?: string
) {
  const database = await getDatabase();
  const scope = getSmartUploadScope(userId, kind, scopeId);
  const transaction = database.transaction("media", "readwrite");
  const mediaKeys = await transaction.store.index("by-scope").getAllKeys(scope);
  for (const key of mediaKeys) {
    await transaction.store.delete(key);
  }
  await transaction.done;
}

export async function deleteSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind,
  scopeId?: string
) {
  const database = await getDatabase();
  const scope = getSmartUploadScope(userId, kind, scopeId);
  const transaction = database.transaction(["sessions", "media"], "readwrite");
  const mediaKeys = await transaction
    .objectStore("media")
    .index("by-scope")
    .getAllKeys(scope);
  await transaction.objectStore("sessions").delete(scope);
  for (const key of mediaKeys) {
    await transaction.objectStore("media").delete(key);
  }
  await transaction.done;
}
