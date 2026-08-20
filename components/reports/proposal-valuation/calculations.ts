import type {
  ProposalValuationEvaluator,
  ProposalValuationRow,
  ProposalValuationSheet,
} from "./types";

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function makeEvaluatorId() {
  return `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function cloneProposalValuationSheet(sheet: ProposalValuationSheet) {
  return structuredClone(sheet);
}

export function rowAverage(
  row: ProposalValuationRow,
  evaluators: ProposalValuationEvaluator[]
) {
  const values = evaluators
    .map((evaluator) => numberOrNull(row.evaluator_values?.[evaluator.id]))
    .filter((value): value is number => value !== null);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function recalculateProposalValuationSheet(
  sheet: ProposalValuationSheet
): ProposalValuationSheet {
  const evaluators = sheet.evaluator_columns.map((column) => ({
    id: column.id,
    name: String(column.name || "").trim() || "Evaluator",
  }));

  return {
    ...sheet,
    evaluator_columns: evaluators,
    rows: sheet.rows.map((row) => {
      const evaluatorValues = Object.fromEntries(
        evaluators.map((column) => [
          column.id,
          numberOrNull(row.evaluator_values?.[column.id]),
        ])
      ) as Record<string, number | null>;
      const filled = Object.values(evaluatorValues).filter(
        (value): value is number => value !== null
      );
      const low = filled.length ? Math.min(...filled) : null;
      const high = filled.length ? Math.max(...filled) : null;
      const premium = high === null ? null : Math.min(high * 0.15, 2000);
      const gross = high === null || premium === null ? null : high + premium;

      return {
        ...row,
        evaluator_values: evaluatorValues,
        low_est_sale_value: low,
        high_est_sale_value: high,
        buyer_premium_percent: 15,
        buyer_premium_amount: premium,
        total_expected_gross: gross,
        allocated_value: gross,
        cleaning: high === null ? null : high * 0.01,
        lotting_fee: high === null ? null : high * 0.01,
        advertising: high === null ? null : high * 0.01,
        lien_search: numberOrNull(row.lien_search),
        video_cost: numberOrNull(row.video_cost),
      };
    }),
    file_summary: {
      buyers_premium_basis:
        sheet.file_summary?.buyers_premium_basis === "capped"
          ? "capped"
          : "uncapped",
      total_risk_weighted_value: numberOrNull(
        sheet.file_summary?.total_risk_weighted_value
      ),
      file_risk_multiplier: numberOrNull(
        sheet.file_summary?.file_risk_multiplier
      ),
      commission_percent_no_guarantee: numberOrNull(
        sheet.file_summary?.commission_percent_no_guarantee
      ),
      offer2_nmg_percent: Math.max(
        0,
        Math.min(1, numberOrNull(sheet.file_summary?.offer2_nmg_percent) ?? 0.785)
      ),
      capped_threshold_percent: Math.max(
        0,
        Math.min(
          1,
          numberOrNull(sheet.file_summary?.capped_threshold_percent) ?? 0.1
        )
      ),
    },
  };
}

export function proposalValuationTotals(sheet: ProposalValuationSheet) {
  const evaluatorTotal = sheet.rows.reduce(
    (sum, row) => sum + rowAverage(row, sheet.evaluator_columns),
    0
  );
  const lowTotal = sheet.rows.reduce(
    (sum, row) => sum + finite(row.low_est_sale_value),
    0
  );
  const highTotal = sheet.rows.reduce(
    (sum, row) => sum + finite(row.high_est_sale_value),
    0
  );
  const projectedCosts = sheet.rows.reduce(
    (sum, row) =>
      sum +
      finite(row.cleaning) +
      finite(row.lien_search) +
      finite(row.video_cost) +
      finite(row.lotting_fee) +
      finite(row.advertising),
    0
  );
  const offerTwo = evaluatorTotal * sheet.file_summary.offer2_nmg_percent;
  const threshold = offerTwo * 0.15;

  return {
    evaluatorTotal,
    lowTotal,
    highTotal,
    projectedCosts,
    offerTwo,
    threshold,
    overage: evaluatorTotal - offerTwo,
  };
}

export function formatMoney(value: number | null | undefined, currency = "CAD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
