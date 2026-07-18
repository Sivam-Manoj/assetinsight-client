export const FORM_DRAFT_VERSION = 2 as const;

export type FormDraftKind = "asset" | "lot-listing";

export type ScopedDraftEnvelope = {
  version: number;
  kind: FormDraftKind;
  userId: string;
};

export class DraftEnvelopeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "corrupt"
      | "unsupported-version"
      | "wrong-kind"
      | "wrong-user"
  ) {
    super(message);
    this.name = "DraftEnvelopeError";
  }
}

export function getScopedDraftKey(
  userId: string | null | undefined,
  kind: FormDraftKind
) {
  if (!userId) return null;
  return "cv:" + userId + ":" + kind + ":draft:v2";
}

export function parseScopedDraftEnvelope<T extends ScopedDraftEnvelope>(
  raw: string,
  expected: { userId: string; kind: FormDraftKind }
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DraftEnvelopeError(
      "The saved draft is not valid JSON.",
      "corrupt"
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new DraftEnvelopeError(
      "The saved draft has an invalid shape.",
      "corrupt"
    );
  }

  const envelope = parsed as Partial<ScopedDraftEnvelope>;
  if (envelope.version !== FORM_DRAFT_VERSION) {
    throw new DraftEnvelopeError(
      "The saved draft uses an unsupported version.",
      "unsupported-version"
    );
  }
  if (envelope.kind !== expected.kind) {
    throw new DraftEnvelopeError(
      "The saved draft belongs to a different form.",
      "wrong-kind"
    );
  }
  if (envelope.userId !== expected.userId) {
    throw new DraftEnvelopeError(
      "The saved draft belongs to a different user.",
      "wrong-user"
    );
  }

  return parsed as T;
}
