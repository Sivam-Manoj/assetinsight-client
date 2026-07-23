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
  files: Array<SmartUploadStoredFile & { file: File }>;
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
  kind: SmartUploadKind
) {
  return `${userId}:${kind}`;
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
  clientSubmissionId: string;
  details: Record<string, unknown>;
  files: File[];
}) {
  await requestPersistentStorage();
  const database = await getDatabase();
  const scope = getSmartUploadScope(args.userId, args.kind);
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
  await Promise.all(
    existingIds.map((id) => transaction.objectStore("media").delete(id))
  );
  await Promise.all(
    args.files.map((file, index) => {
      const record = records[index];
      return transaction.objectStore("media").put({
        id: `${scope}:${record.fileId}`,
        scope,
        blob: file,
      });
    })
  );
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
  await transaction.objectStore("sessions").put(state);
  await transaction.done;
  return hydrateState(state, database);
}

export async function updateSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind,
  changes: Partial<
    Pick<
      SmartUploadDraftState,
      "sessionId" | "stage" | "details" | "files"
    >
  >
) {
  const database = await getDatabase();
  const scope = getSmartUploadScope(userId, kind);
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

async function hydrateState(
  state: SmartUploadDraftState,
  database: IDBPDatabase<SmartUploadDatabase>
): Promise<SmartUploadDraft> {
  const media = await database.getAllFromIndex(
    "media",
    "by-scope",
    state.scope
  );
  const mediaById = new Map(media.map((item) => [item.id, item.blob]));
  const hydrated: SmartUploadDraft["files"] = [];
  for (const descriptor of state.files) {
    const blob = mediaById.get(`${state.scope}:${descriptor.fileId}`);
    if (!blob) {
      throw new Error(
        `${descriptor.name} is missing from browser recovery storage. Select the images again.`
      );
    }
    hydrated.push({
      ...descriptor,
      file: new File([blob], descriptor.name, {
        type: descriptor.type || blob.type,
        lastModified: descriptor.lastModified,
      }),
    });
  }
  return { ...state, files: hydrated };
}

export async function loadSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind
) {
  const database = await getDatabase();
  const state = await database.get(
    "sessions",
    getSmartUploadScope(userId, kind)
  );
  return state ? hydrateState(state, database) : null;
}

export async function deleteSmartUploadDraft(
  userId: string,
  kind: SmartUploadKind
) {
  const database = await getDatabase();
  const scope = getSmartUploadScope(userId, kind);
  const transaction = database.transaction(["sessions", "media"], "readwrite");
  const mediaKeys = await transaction
    .objectStore("media")
    .index("by-scope")
    .getAllKeys(scope);
  await transaction.objectStore("sessions").delete(scope);
  await Promise.all(
    mediaKeys.map((key) => transaction.objectStore("media").delete(key))
  );
  await transaction.done;
}
