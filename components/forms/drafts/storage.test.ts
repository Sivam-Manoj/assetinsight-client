import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  deleteScopedDraft,
  DraftEnvelopeError,
  getScopedDraftKey,
  hasScopedDraft,
  loadScopedDraft,
  parseScopedDraftEnvelope,
  saveScopedDraft,
} from "./storage";

describe("scoped v2 form drafts", () => {
  it("isolates users and form types in their storage keys", () => {
    expect(getScopedDraftKey("user-a", "asset")).toBe(
      "cv:user-a:asset:draft:v2"
    );
    expect(getScopedDraftKey("user-a", "lot-listing")).toBe(
      "cv:user-a:lot-listing:draft:v2"
    );
    expect(getScopedDraftKey("user-b", "asset")).not.toBe(
      getScopedDraftKey("user-a", "asset")
    );
    expect(getScopedDraftKey(null, "asset")).toBeNull();
  });

  it("accepts only the attributed user, form, and v2 envelope", () => {
    const raw = JSON.stringify({
      version: 2,
      kind: "asset",
      userId: "user-a",
      revision: 8,
    });

    expect(
      parseScopedDraftEnvelope(raw, { userId: "user-a", kind: "asset" })
    ).toMatchObject({ revision: 8 });

    expect(() =>
      parseScopedDraftEnvelope(raw, {
        userId: "user-b",
        kind: "asset",
      })
    ).toThrowError(DraftEnvelopeError);
    expect(() =>
      parseScopedDraftEnvelope(raw, {
        userId: "user-a",
        kind: "lot-listing",
      })
    ).toThrowError(DraftEnvelopeError);
  });

  it("rejects corrupt and unsupported envelopes without falling back to legacy data", () => {
    expect(() =>
      parseScopedDraftEnvelope("{broken", {
        userId: "user-a",
        kind: "asset",
      })
    ).toThrowError(/not valid JSON/i);
    expect(() =>
      parseScopedDraftEnvelope(
        JSON.stringify({
          version: 1,
          kind: "asset",
          userId: "user-a",
        }),
        { userId: "user-a", kind: "asset" }
      )
    ).toThrowError(/unsupported version/i);
  });
});

describe("scoped v3 IndexedDB drafts", () => {
  it("restores original media and removes the draft transactionally", async () => {
    const userId = "indexed-media-user";
    await deleteScopedDraft(userId, "asset");
    const image = new File(["original-image-bytes"], "lot-1.jpg", {
      type: "image/jpeg",
      lastModified: 1234,
    });

    await saveScopedDraft({
      version: 3,
      kind: "asset",
      userId,
      revision: 1,
      savedAt: "2026-07-21T10:00:00.000Z",
      lots: [{ files: [image] }],
    });

    const loaded = await loadScopedDraft<{
      version: 3;
      kind: "asset";
      userId: string;
      revision: number;
      savedAt: string;
      lots: Array<{ files: File[] }>;
    }>(userId, "asset");

    expect(loaded?.missingMediaCount).toBe(0);
    expect(loaded?.envelope.lots[0].files[0]).toBeInstanceOf(File);
    expect(loaded?.envelope.lots[0].files[0].name).toBe("lot-1.jpg");

    await deleteScopedDraft(userId, "asset");
    expect(await hasScopedDraft(userId, "asset")).toBe(false);
  });

  it("keeps remaining media valid when photos are reordered or removed", async () => {
    const userId = "indexed-revision-user";
    await deleteScopedDraft(userId, "lot-listing");
    const first = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const second = new File(["second"], "second.jpg", { type: "image/jpeg" });
    const base = {
      version: 3 as const,
      kind: "lot-listing" as const,
      userId,
      savedAt: "2026-07-21T10:00:00.000Z",
    };

    await saveScopedDraft({ ...base, revision: 1, lots: [{ files: [first, second] }] });
    await saveScopedDraft({ ...base, revision: 2, lots: [{ files: [second] }] });

    const loaded = await loadScopedDraft<
      typeof base & { revision: number; lots: Array<{ files: File[] }> }
    >(userId, "lot-listing");
    expect(loaded?.missingMediaCount).toBe(0);
    expect(loaded?.envelope.revision).toBe(2);
    expect(loaded?.envelope.lots[0].files.map((file) => file.name)).toEqual([
      "second.jpg",
    ]);
    await deleteScopedDraft(userId, "lot-listing");
  });

  it("persists a large multi-lot draft without storing media in localStorage", async () => {
    const userId = "indexed-large-draft-user";
    await deleteScopedDraft(userId, "asset");
    const lots = Array.from({ length: 6 }, (_, lotIndex) => ({
      files: Array.from({ length: 20 }, (_, imageIndex) =>
        new File(
          [`lot-${lotIndex + 1}-image-${imageIndex + 1}`],
          `lot-${lotIndex + 1}-${imageIndex + 1}.jpg`,
          { type: "image/jpeg", lastModified: lotIndex * 100 + imageIndex }
        )
      ),
    }));

    await saveScopedDraft({
      version: 3,
      kind: "asset",
      userId,
      revision: 1,
      savedAt: "2026-07-21T10:00:00.000Z",
      lots,
    });

    const loaded = await loadScopedDraft<{
      version: 3;
      kind: "asset";
      userId: string;
      revision: number;
      savedAt: string;
      lots: Array<{ files: File[] }>;
    }>(userId, "asset");

    expect(loaded?.missingMediaCount).toBe(0);
    expect(loaded?.envelope.lots).toHaveLength(6);
    expect(loaded?.envelope.lots.flatMap((lot) => lot.files)).toHaveLength(120);
    expect(localStorage.getItem(getScopedDraftKey(userId, "asset") ?? "")).toBeNull();

    await deleteScopedDraft(userId, "asset");
  });
});
