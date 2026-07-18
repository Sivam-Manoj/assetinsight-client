import { describe, expect, it } from "vitest";
import {
  DraftEnvelopeError,
  getScopedDraftKey,
  parseScopedDraftEnvelope,
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
