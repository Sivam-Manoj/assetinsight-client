import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSmartUploadDraft,
  deleteSmartUploadDraft,
  loadSmartUploadDraft,
  updateSmartUploadDraft,
} from "./storage";

const USER_ID = "smart-upload-storage-test-user";

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: globalThis,
});
Object.defineProperty(globalThis, "File", {
  configurable: true,
  value: NodeFile,
});

afterEach(async () => {
  await Promise.all([
    deleteSmartUploadDraft(USER_ID, "asset"),
    deleteSmartUploadDraft(USER_ID, "lot-listing"),
  ]);
});

describe("Smart Upload IndexedDB recovery", () => {
  it("restores file bytes and original order after upload progress is saved", async () => {
    const files = [
      new File(["first"], "first.jpg", {
        type: "image/jpeg",
        lastModified: 1,
      }),
      new File(["divider"], "divider.png", {
        type: "image/png",
        lastModified: 2,
      }),
      new File(["third"], "third.webp", {
        type: "image/webp",
        lastModified: 3,
      }),
    ];

    const created = await createSmartUploadDraft({
      userId: USER_ID,
      kind: "asset",
      clientSubmissionId: "submission-1",
      details: { contract_no: "CTR-1" },
      files,
    });

    await updateSmartUploadDraft(USER_ID, "asset", {
      sessionId: "session-1",
      stage: "uploading",
      files: created.files.map(({ file: _file, ...descriptor }, index) => ({
        ...descriptor,
        uploaded: index < 2,
      })),
    });

    const restored = await loadSmartUploadDraft(USER_ID, "asset");
    expect(restored?.sessionId).toBe("session-1");
    expect(restored?.files.map((file) => file.fileId)).toEqual([
      "images-0",
      "images-1",
      "images-2",
    ]);
    expect(restored?.files.map((file) => file.originalOrder)).toEqual([
      0, 1, 2,
    ]);
    expect(restored?.files.map((file) => file.uploaded)).toEqual([
      true,
      true,
      false,
    ]);
    await expect(restored?.files[2].file.text()).resolves.toBe("third");
  });

  it("keeps Asset and Lot Listing recovery sessions isolated", async () => {
    await createSmartUploadDraft({
      userId: USER_ID,
      kind: "asset",
      clientSubmissionId: "asset-submission",
      details: { contract_no: "ASSET-1" },
      files: [new File(["asset"], "asset.jpg", { type: "image/jpeg" })],
    });
    await createSmartUploadDraft({
      userId: USER_ID,
      kind: "lot-listing",
      clientSubmissionId: "listing-submission",
      details: { contract_no: "LISTING-1" },
      files: [new File(["listing"], "listing.jpg", { type: "image/jpeg" })],
    });

    const [asset, listing] = await Promise.all([
      loadSmartUploadDraft(USER_ID, "asset"),
      loadSmartUploadDraft(USER_ID, "lot-listing"),
    ]);
    expect(asset?.details.contract_no).toBe("ASSET-1");
    expect(listing?.details.contract_no).toBe("LISTING-1");
  });
});
