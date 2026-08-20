"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { ProposalValuationService } from "@/services/proposalValuation";
import {
  cloneProposalValuationSheet,
  formatMoney,
  makeEvaluatorId,
  proposalValuationTotals,
  recalculateProposalValuationSheet,
  rowAverage,
} from "./proposal-valuation/calculations";
import type {
  ProposalValuationEvaluator,
  ProposalValuationPayload,
  ProposalValuationRow,
  ProposalValuationSheet,
} from "./proposal-valuation/types";

type Props = {
  open: boolean;
  reportId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type RowChange = (
  lotId: string,
  key: keyof ProposalValuationRow,
  value: string | number | null
) => void;

type EvaluatorChange = (
  lotId: string,
  evaluatorId: string,
  value: number | null
) => void;

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowRange(row: ProposalValuationRow, evaluators: ProposalValuationEvaluator[]) {
  const values = evaluators
    .map((column) => row.evaluator_values?.[column.id])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    low: values.length ? Math.min(...values) : null,
    high: values.length ? Math.max(...values) : null,
  };
}

const ValuationRow = memo(function ValuationRow({
  row,
  evaluators,
  currency,
  onChange,
  onEvaluatorChange,
}: {
  row: ProposalValuationRow;
  evaluators: ProposalValuationEvaluator[];
  currency: string;
  onChange: RowChange;
  onEvaluatorChange: EvaluatorChange;
}) {
  const average = rowAverage(row, evaluators);
  const range = rowRange(row, evaluators);
  const image = row.picture_urls?.[0];

  return (
    <tr
      className="border-b border-[var(--app-border)] align-top last:border-0"
      style={{ contentVisibility: "auto", containIntrinsicSize: "72px" }}
    >
      <td className="sticky left-0 z-[1] min-w-[240px] bg-[var(--app-panel)] px-3 py-3">
        <div className="flex min-w-0 gap-2.5">
          <div className="size-12 shrink-0 overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <BarChart3 className="m-3 size-6 text-[var(--app-text-muted)]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--app-text-strong)]">
              {row.asset_id || row.lot_id}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[var(--app-text-muted)]">
              {[row.year, row.make, row.model].filter(Boolean).join(" ") || row.asset_category || "Asset"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">
              {row.pictures || 0} photos
            </p>
          </div>
        </div>
      </td>
      <td className="min-w-[190px] px-2 py-3">
        <input
          value={row.location || ""}
          onChange={(event) => onChange(row.lot_id, "location", event.target.value)}
          className="h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2.5 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]"
          placeholder="City, state/province"
        />
      </td>
      <td className="min-w-[118px] px-2 py-3">
        <input
          value={row.condition_score || ""}
          onChange={(event) => onChange(row.lot_id, "condition_score", event.target.value)}
          className="h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2.5 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]"
          placeholder="1-5"
        />
      </td>
      <td className="min-w-[140px] px-2 py-3 text-sm font-semibold text-[var(--app-accent)]">
        {row.asset_insight || "-"}
      </td>
      {evaluators.map((column) => (
        <td key={column.id} className="min-w-[132px] px-2 py-3">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={row.evaluator_values?.[column.id] ?? ""}
            onChange={(event) =>
              onEvaluatorChange(row.lot_id, column.id, parseNumber(event.target.value))
            }
            className="h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2.5 text-right text-sm font-semibold tabular-nums text-[var(--app-text)] outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]"
            aria-label={`${column.name} valuation for ${row.asset_id || row.lot_id}`}
          />
        </td>
      ))}
      <td className="min-w-[130px] px-3 py-3 text-right text-sm font-bold tabular-nums text-[var(--app-text-strong)]">
        {formatMoney(average, currency)}
      </td>
      <td className="min-w-[130px] px-3 py-3 text-right text-sm tabular-nums text-[var(--app-text)]">
        {formatMoney(range.low, currency)}
      </td>
      <td className="min-w-[130px] px-3 py-3 text-right text-sm tabular-nums text-[var(--app-text)]">
        {formatMoney(range.high, currency)}
      </td>
    </tr>
  );
});

const MobileValuationCard = memo(function MobileValuationCard({
  row,
  evaluators,
  currency,
  onChange,
  onEvaluatorChange,
}: {
  row: ProposalValuationRow;
  evaluators: ProposalValuationEvaluator[];
  currency: string;
  onChange: RowChange;
  onEvaluatorChange: EvaluatorChange;
}) {
  const average = rowAverage(row, evaluators);
  const range = rowRange(row, evaluators);
  const image = row.picture_urls?.[0];

  return (
    <article
      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "420px" }}
    >
      <div className="flex gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <BarChart3 className="m-4 size-8 text-[var(--app-text-muted)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[var(--app-text-strong)]">
            {row.asset_id || row.lot_id}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--app-text-muted)]">
            {[row.year, row.make, row.model].filter(Boolean).join(" ") || row.asset_category}
          </p>
          <p className="mt-2 text-lg font-bold tabular-nums text-[var(--app-accent)]">
            {formatMoney(average, currency)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-[var(--app-text-muted)]">
          Location
          <input
            value={row.location || ""}
            onChange={(event) => onChange(row.lot_id, "location", event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2 text-sm font-normal text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--app-text-muted)]">
          Condition (1-5)
          <input
            value={row.condition_score || ""}
            onChange={(event) => onChange(row.lot_id, "condition_score", event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2 text-sm font-normal text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {evaluators.map((column) => (
          <label key={column.id} className="text-xs font-semibold text-[var(--app-text-muted)]">
            {column.name}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={row.evaluator_values?.[column.id] ?? ""}
              onChange={(event) =>
                onEvaluatorChange(row.lot_id, column.id, parseNumber(event.target.value))
              }
              className="mt-1 h-9 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2 text-right text-sm font-semibold tabular-nums text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--app-border)] pt-3 text-xs">
        <p className="text-[var(--app-text-muted)]">Low <strong className="block text-sm text-[var(--app-text)]">{formatMoney(range.low, currency)}</strong></p>
        <p className="text-[var(--app-text-muted)]">High <strong className="block text-sm text-[var(--app-text)]">{formatMoney(range.high, currency)}</strong></p>
      </div>
    </article>
  );
});

export default function ProposalValuationDialog({
  open,
  reportId,
  onClose,
  onSaved,
}: Props) {
  const [payload, setPayload] = useState<ProposalValuationPayload | null>(null);
  const [sheet, setSheet] = useState<ProposalValuationSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"lots" | "summary">("lots");
  const [dirty, setDirty] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const currency = payload?.currencyCode || "CAD";

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await ProposalValuationService.get(reportId, signal);
      setPayload(response);
      setSheet(cloneProposalValuationSheet(response.assetScheduleSheet));
      setDirty(false);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load Proposal Valuation.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved Proposal Valuation changes?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    if (!deferredQuery) return sheet.rows;
    return sheet.rows.filter((row) =>
      [row.asset_id, row.asset_category, row.year, row.make, row.model, row.serial_number, row.location]
        .join(" ")
        .toLowerCase()
        .includes(deferredQuery)
    );
  }, [deferredQuery, sheet]);

  const totals = useMemo(
    () => (sheet ? proposalValuationTotals(sheet) : null),
    [sheet]
  );

  const updateRow = useCallback<RowChange>((lotId, key, value) => {
    setSheet((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.lot_id === lotId ? { ...row, [key]: value } : row
            ),
          }
        : current
    );
    setDirty(true);
  }, []);

  const updateEvaluatorValue = useCallback<EvaluatorChange>(
    (lotId, evaluatorId, value) => {
      setSheet((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.lot_id === lotId
                  ? {
                      ...row,
                      evaluator_values: {
                        ...row.evaluator_values,
                        [evaluatorId]: value,
                      },
                    }
                  : row
              ),
            }
          : current
      );
      setDirty(true);
    },
    []
  );

  const renameEvaluator = useCallback((id: string, name: string) => {
    setSheet((current) =>
      current
        ? {
            ...current,
            evaluator_columns: current.evaluator_columns.map((column) =>
              column.id === id ? { ...column, name } : column
            ),
          }
        : current
    );
    setDirty(true);
  }, []);

  const addEvaluator = useCallback(() => {
    const id = makeEvaluatorId();
    setSheet((current) =>
      current
        ? {
            ...current,
            evaluator_columns: [
              ...current.evaluator_columns,
              { id, name: `Evaluator ${current.evaluator_columns.length + 1}` },
            ],
            rows: current.rows.map((row) => ({
              ...row,
              evaluator_values: { ...row.evaluator_values, [id]: null },
            })),
          }
        : current
    );
    setDirty(true);
  }, []);

  const removeEvaluator = useCallback((id: string) => {
    setSheet((current) => {
      if (!current || current.evaluator_columns.length <= 1) return current;
      return {
        ...current,
        evaluator_columns: current.evaluator_columns.filter((column) => column.id !== id),
        rows: current.rows.map((row) => {
          const evaluatorValues = { ...row.evaluator_values };
          delete evaluatorValues[id];
          return { ...row, evaluator_values: evaluatorValues };
        }),
      };
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!sheet || saving) return;
    setSaving(true);
    try {
      const calculated = recalculateProposalValuationSheet(sheet);
      const response = await ProposalValuationService.save(reportId, calculated);
      setPayload(response);
      setSheet(cloneProposalValuationSheet(response.assetScheduleSheet));
      setDirty(false);
      toast.success(
        response.files_regeneration_coalesced
          ? "Proposal Valuation saved. The current file update will include these changes."
          : "Proposal Valuation saved. Updated files are being generated."
      );
      onSaved?.();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save Proposal Valuation.");
    } finally {
      setSaving(false);
    }
  }, [onSaved, reportId, saving, sheet]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex bg-black/55 p-0 backdrop-blur-sm sm:p-3 lg:p-5" role="dialog" aria-modal="true" aria-label="Proposal Valuation">
      <section className="flex min-h-0 w-full flex-col overflow-hidden bg-[var(--app-bg)] shadow-2xl sm:rounded-xl sm:border sm:border-[var(--app-border)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
                <BarChart3 className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-[var(--app-text-strong)] sm:text-lg">Proposal Valuation</h2>
                <p className="truncate text-xs text-[var(--app-text-muted)]">{payload?.title || "Asset report"}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!sheet || !dirty || saving}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--app-accent)] px-3 text-sm font-bold text-[var(--app-on-accent)] transition-colors hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span className="hidden sm:inline">{saving ? "Saving" : "Save & update files"}</span>
              <span className="sm:hidden">Save</span>
            </button>
            <button type="button" onClick={close} className="grid size-9 place-items-center rounded-md border border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]" aria-label="Close Proposal Valuation">
              <X className="size-4" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-0 flex-1 place-items-center">
            <div className="text-center">
              <RefreshCw className="mx-auto size-7 animate-spin text-[var(--app-accent)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--app-text)]">Loading Proposal Valuation...</p>
            </div>
          </div>
        ) : error ? (
          <div className="grid min-h-0 flex-1 place-items-center p-6">
            <div className="max-w-md rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] p-5 text-center">
              <AlertCircle className="mx-auto size-7 text-[var(--app-danger)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--app-danger)]">{error}</p>
              <button type="button" onClick={() => void load()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--app-danger-border)] px-3 text-sm font-bold text-[var(--app-danger)]">
                <RefreshCw className="size-4" /> Retry
              </button>
            </div>
          </div>
        ) : sheet && totals ? (
          <>
            <div className="shrink-0 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 sm:px-5">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  ["Assets", String(sheet.rows.length)],
                  ["Evaluator average", formatMoney(totals.evaluatorTotal, currency)],
                  ["Estimated range", `${formatMoney(totals.lowTotal, currency)} - ${formatMoney(totals.highTotal, currency)}`],
                  ["Projected costs", formatMoney(totals.projectedCosts, currency)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-text-muted)]">{label}</p>
                    <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-[var(--app-text-strong)] sm:text-base">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] p-0.5">
                  <button type="button" onClick={() => setTab("lots")} className={`h-8 rounded px-3 text-xs font-bold ${tab === "lots" ? "bg-[var(--app-panel)] text-[var(--app-accent)] shadow-sm" : "text-[var(--app-text-muted)]"}`}>Lots</button>
                  <button type="button" onClick={() => setTab("summary")} className={`h-8 rounded px-3 text-xs font-bold ${tab === "summary" ? "bg-[var(--app-panel)] text-[var(--app-accent)] shadow-sm" : "text-[var(--app-text-muted)]"}`}>File summary</button>
                </div>
                {dirty ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--app-warning)]"><AlertCircle className="size-3.5" /> Unsaved changes</span> : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--app-success)]"><CheckCircle2 className="size-3.5" /> Saved</span>}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {tab === "lots" ? (
                <div className="p-3 sm:p-4 lg:p-5">
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-[var(--app-text-muted)]"><Users className="size-3.5" /> Evaluators</div>
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                        {sheet.evaluator_columns.map((column) => (
                          <div key={column.id} className="flex shrink-0 items-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)]">
                            <input value={column.name} onChange={(event) => renameEvaluator(column.id, event.target.value)} className="h-9 w-32 bg-transparent px-2.5 text-sm font-semibold text-[var(--app-text)] outline-none" aria-label="Evaluator name" />
                            <button type="button" onClick={() => removeEvaluator(column.id)} disabled={sheet.evaluator_columns.length <= 1} className="grid size-9 place-items-center border-l border-[var(--app-border)] text-[var(--app-danger)] disabled:opacity-30" aria-label={`Remove ${column.name}`}><Trash2 className="size-3.5" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={addEvaluator} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] px-3 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]"><Plus className="size-3.5" /> Add evaluator</button>
                      </div>
                    </div>
                    <label className="relative block w-full lg:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--app-text-muted)]" />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets" className="h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] pl-9 pr-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]" />
                    </label>
                  </div>

                  <div className="hidden overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] md:block">
                    <table className="w-max min-w-full border-collapse">
                      <thead className="sticky top-0 z-[3] bg-[var(--app-panel-alt)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--app-text-muted)]">
                        <tr>
                          <th className="sticky left-0 z-[4] min-w-[240px] bg-[var(--app-panel-alt)] px-3 py-2.5">Asset</th>
                          <th className="min-w-[190px] px-2 py-2.5">Location</th>
                          <th className="min-w-[118px] px-2 py-2.5">Condition</th>
                          <th className="min-w-[140px] px-2 py-2.5">Asset Insight</th>
                          {sheet.evaluator_columns.map((column) => <th key={column.id} className="min-w-[132px] px-2 py-2.5 text-right">{column.name}</th>)}
                          <th className="min-w-[130px] px-3 py-2.5 text-right">Average</th>
                          <th className="min-w-[130px] px-3 py-2.5 text-right">Low</th>
                          <th className="min-w-[130px] px-3 py-2.5 text-right">High</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => <ValuationRow key={row.lot_id} row={row} evaluators={sheet.evaluator_columns} currency={currency} onChange={updateRow} onEvaluatorChange={updateEvaluatorValue} />)}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:hidden">
                    {filteredRows.map((row) => <MobileValuationCard key={row.lot_id} row={row} evaluators={sheet.evaluator_columns} currency={currency} onChange={updateRow} onEvaluatorChange={updateEvaluatorValue} />)}
                  </div>
                  {!filteredRows.length ? <div className="rounded-lg border border-dashed border-[var(--app-border)] p-10 text-center text-sm text-[var(--app-text-muted)]">No assets match this search.</div> : null}
                </div>
              ) : (
                <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_1fr] lg:p-6">
                  <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                    <h3 className="text-base font-bold text-[var(--app-text-strong)]">Proposal controls</h3>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">Adjust the percentages used by the proposal calculations.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Buyer premium basis
                        <select value={sheet.file_summary.buyers_premium_basis} onChange={(event) => { setSheet((current) => current ? { ...current, file_summary: { ...current.file_summary, buyers_premium_basis: event.target.value === "capped" ? "capped" : "uncapped" } } : current); setDirty(true); }} className="mt-1 h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"><option value="uncapped">Uncapped</option><option value="capped">Capped</option></select>
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Offer 2 NMG (%)
                        <input type="number" min="0" max="100" step="0.1" value={(sheet.file_summary.offer2_nmg_percent * 100).toFixed(1)} onChange={(event) => { const value = Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100; setSheet((current) => current ? { ...current, file_summary: { ...current.file_summary, offer2_nmg_percent: value } } : current); setDirty(true); }} className="mt-1 h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-3 text-right text-sm font-semibold text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Capped threshold (%)
                        <input type="number" min="0" max="100" step="0.1" value={(sheet.file_summary.capped_threshold_percent * 100).toFixed(1)} onChange={(event) => { const value = Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100; setSheet((current) => current ? { ...current, file_summary: { ...current.file_summary, capped_threshold_percent: value } } : current); setDirty(true); }} className="mt-1 h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-3 text-right text-sm font-semibold text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Commission without guarantee (%)
                        <input type="number" min="0" step="0.1" value={sheet.file_summary.commission_percent_no_guarantee ?? ""} onChange={(event) => { const value = parseNumber(event.target.value); setSheet((current) => current ? { ...current, file_summary: { ...current.file_summary, commission_percent_no_guarantee: value } } : current); setDirty(true); }} className="mt-1 h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-3 text-right text-sm font-semibold text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
                      </label>
                    </div>
                  </section>
                  <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                    <h3 className="text-base font-bold text-[var(--app-text-strong)]">Calculated summary</h3>
                    <div className="mt-4 divide-y divide-[var(--app-border)]">
                      {[
                        ["Evaluator average", totals.evaluatorTotal],
                        ["Offer 2 NMG", totals.offerTwo],
                        ["Offer 2 threshold", totals.threshold],
                        ["Offer 2 overage", totals.overage],
                        ["Projected costs", totals.projectedCosts],
                      ].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-[var(--app-text-muted)]">{label}</span><strong className="tabular-nums text-[var(--app-text-strong)]">{formatMoney(value as number, currency)}</strong></div>)}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
