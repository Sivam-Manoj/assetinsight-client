type PreviewRecord = Record<string, any>;

function getLotKey(lot: PreviewRecord | undefined, index: number): string {
  const identity = lot?.lot_id ?? lot?.id ?? lot?._id ?? lot?.lot_number;
  return identity === undefined || identity === null || String(identity).trim() === ""
    ? `index:${index}`
    : `lot:${String(identity).trim()}`;
}

/**
 * Keeps the exact edits submitted by the user while retaining server-only fields.
 * File refresh responses must never be able to restore an older lot snapshot.
 */
export function mergeSubmittedPreviewData(
  serverPreview: PreviewRecord | null | undefined,
  submittedPreview: PreviewRecord
): PreviewRecord {
  if (!serverPreview || typeof serverPreview !== "object") return submittedPreview;

  const submittedLots = Array.isArray(submittedPreview?.lots) ? submittedPreview.lots : [];
  const serverLots = Array.isArray(serverPreview?.lots) ? serverPreview.lots : [];
  const submittedByKey = new Map(
    submittedLots.map((lot: PreviewRecord, index: number) => [getLotKey(lot, index), lot])
  );

  const mergedLots = (serverLots.length > 0 ? serverLots : submittedLots).map(
    (serverLot: PreviewRecord, index: number) => {
      const submittedLot = submittedByKey.get(getLotKey(serverLot, index)) || submittedLots[index];
      return submittedLot ? { ...serverLot, ...submittedLot } : serverLot;
    }
  );

  return {
    ...serverPreview,
    ...submittedPreview,
    lots: mergedLots,
  };
}
