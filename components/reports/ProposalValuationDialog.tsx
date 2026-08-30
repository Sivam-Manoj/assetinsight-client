"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Images,
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

type FileSummaryChange = <K extends keyof ProposalValuationSheet["file_summary"]>(
  key: K,
  value: ProposalValuationSheet["file_summary"][K]
) => void;

type PictureGalleryState = {
  label: string;
  urls: string[];
  index: number;
};

type OpenPictureGallery = (
  label: string,
  urls: string[],
  opener: HTMLButtonElement
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

const textControlClass =
  "w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-2.5 py-2 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]";
const numericControlClass = `${textControlClass} text-right font-semibold tabular-nums`;

function assetLabel(row: ProposalValuationRow) {
  return row.asset_id || row.lot_id || "asset";
}

function validPictureUrls(row: ProposalValuationRow) {
  return (row.picture_urls || [])
    .map((url) => String(url || "").trim())
    .filter(Boolean);
}

function pictureCount(row: ProposalValuationRow, urls = validPictureUrls(row)) {
  return urls.length || Math.max(0, Math.trunc(Number(row.pictures) || 0));
}

function rowDisplayValues(
  row: ProposalValuationRow,
  evaluators: ProposalValuationEvaluator[]
) {
  const average = rowAverage(row, evaluators);
  const range = rowRange(row, evaluators);
  const premium = range.high === null ? null : Math.min(range.high * 0.15, 2000);
  const gross = range.high === null || premium === null ? null : range.high + premium;

  return {
    average,
    low: range.low,
    high: range.high,
    buyerPremiumPercent: row.buyer_premium_percent || 15,
    buyerPremiumAmount: premium,
    totalExpectedGross: gross,
    allocatedValue: gross,
    cleaning: range.high === null ? null : range.high * 0.01,
    lottingFee: range.high === null ? null : range.high * 0.01,
    advertising: range.high === null ? null : range.high * 0.01,
  };
}

function ScheduleTextField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        rows={2}
        className={`${textControlClass} min-h-20 resize-y leading-5`}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoComplete="off"
      className={`${textControlClass} h-10`}
    />
  );
}

function ScheduleNumberField({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      value={value ?? ""}
      onChange={(event) => onChange(parseNumber(event.target.value))}
      aria-label={ariaLabel}
      className={`${numericControlClass} h-10`}
    />
  );
}

function ReadOnlyScheduleValue({
  value,
  accent = false,
  align = "right",
}: {
  value: string | number;
  accent?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`min-h-10 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] px-2.5 py-2 text-sm font-semibold tabular-nums ${
        accent ? "text-[var(--app-accent)]" : "text-[var(--app-text)]"
      } ${align === "right" ? "text-right" : "text-left"}`}
    >
      {value}
    </div>
  );
}

function PictureSummary({
  row,
  onOpen,
  thumbnailOnly = false,
}: {
  row: ProposalValuationRow;
  onOpen: OpenPictureGallery;
  thumbnailOnly?: boolean;
}) {
  const label = assetLabel(row);
  const urls = validPictureUrls(row);
  const count = pictureCount(row, urls);
  const countLabel = `${count} picture${count === 1 ? "" : "s"}`;

  if (thumbnailOnly) {
    if (!urls.length) {
      return (
        <div
          className="grid size-16 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)]"
          aria-label={`No pictures available for ${label}`}
        >
          <Images className="size-7 text-[var(--app-text-muted)]" />
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={(event) => onOpen(label, urls, event.currentTarget)}
        className="size-16 overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] transition-colors hover:border-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-ring)]"
        aria-label={`Open ${countLabel} for ${label}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" loading="lazy" className="size-full object-cover" />
      </button>
    );
  }

  if (!urls.length) {
    return <ReadOnlyScheduleValue value={countLabel} align="left" />;
  }

  return (
    <button
      type="button"
      onClick={(event) => onOpen(label, urls, event.currentTarget)}
      className="group flex min-h-10 w-full items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] p-1.5 text-left text-sm font-semibold text-[var(--app-text)] transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-ring)]"
      aria-label={`Open ${countLabel} for ${label}`}
    >
      <span className="size-8 shrink-0 overflow-hidden rounded border border-[var(--app-border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" loading="lazy" className="size-full object-cover" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate">{countLabel}</span>
        <span className="block text-[10px] font-medium text-[var(--app-text-muted)] group-hover:text-[var(--app-accent)]">
          View
        </span>
      </span>
    </button>
  );
}

const ValuationRow = memo(function ValuationRow({
  row,
  evaluators,
  currency,
  onChange,
  onEvaluatorChange,
  onOpenGallery,
}: {
  row: ProposalValuationRow;
  evaluators: ProposalValuationEvaluator[];
  currency: string;
  onChange: RowChange;
  onEvaluatorChange: EvaluatorChange;
  onOpenGallery: OpenPictureGallery;
}) {
  const display = rowDisplayValues(row, evaluators);
  const label = assetLabel(row);

  return (
    <tr
      className="border-b border-[var(--app-border)] align-top last:border-0"
      style={{ contentVisibility: "auto", containIntrinsicSize: "116px" }}
    >
      <td className="sticky left-0 z-[1] min-w-[120px] bg-[var(--app-panel)] px-2 py-3 text-sm font-bold text-[var(--app-text-strong)]">
        {label}
      </td>
      <td className="min-w-[184px] px-2 py-3">
        <ScheduleTextField value={row.asset_category} onChange={(value) => onChange(row.lot_id, "asset_category", value)} ariaLabel={`Asset category for ${label}`} />
      </td>
      <td className="min-w-[104px] px-2 py-3">
        <ScheduleTextField value={row.year} onChange={(value) => onChange(row.lot_id, "year", value)} ariaLabel={`Year for ${label}`} />
      </td>
      <td className="min-w-[136px] px-2 py-3">
        <ScheduleTextField value={row.make} onChange={(value) => onChange(row.lot_id, "make", value)} ariaLabel={`Make for ${label}`} />
      </td>
      <td className="min-w-[152px] px-2 py-3">
        <ScheduleTextField value={row.model} onChange={(value) => onChange(row.lot_id, "model", value)} ariaLabel={`Model for ${label}`} />
      </td>
      <td className="min-w-[184px] px-2 py-3">
        <ScheduleTextField value={row.serial_number} onChange={(value) => onChange(row.lot_id, "serial_number", value)} ariaLabel={`Serial number for ${label}`} />
      </td>
      <td className="min-w-[280px] px-2 py-3">
        <ScheduleTextField value={row.cr_details} onChange={(value) => onChange(row.lot_id, "cr_details", value)} ariaLabel={`CR details for ${label}`} multiline />
      </td>
      <td className="min-w-[144px] px-2 py-3">
        <ScheduleTextField value={row.condition_score} onChange={(value) => onChange(row.lot_id, "condition_score", value)} ariaLabel={`Condition for ${label}`} placeholder="1-5" />
      </td>
      <td className="min-w-[220px] px-2 py-3">
        <ScheduleTextField value={row.location} onChange={(value) => onChange(row.lot_id, "location", value)} ariaLabel={`Location for ${label}`} placeholder="City, State/Prov" />
      </td>
      <td className="min-w-[120px] px-2 py-3">
        <PictureSummary row={row} onOpen={onOpenGallery} />
      </td>
      <td className="min-w-[176px] px-2 py-3">
        <ReadOnlyScheduleValue value={row.asset_insight || "-"} accent align="left" />
      </td>
      {evaluators.map((column) => (
        <td key={column.id} className="min-w-[152px] px-2 py-3">
          <ScheduleNumberField value={row.evaluator_values?.[column.id] ?? null} onChange={(value) => onEvaluatorChange(row.lot_id, column.id, value)} ariaLabel={`${column.name} valuation for ${label}`} />
        </td>
      ))}
      <td className="min-w-[144px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.average, currency)} /></td>
      <td className="min-w-[160px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.low, currency)} /></td>
      <td className="min-w-[160px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.high, currency)} /></td>
      <td className="min-w-[128px] px-2 py-3"><ReadOnlyScheduleValue value={`${display.buyerPremiumPercent}%`} /></td>
      <td className="min-w-[152px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.buyerPremiumAmount, currency)} /></td>
      <td className="min-w-[176px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.totalExpectedGross, currency)} /></td>
      <td className="min-w-[152px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.allocatedValue, currency)} /></td>
      <td className="min-w-[220px] px-2 py-3">
        <ScheduleTextField value={row.notes} onChange={(value) => onChange(row.lot_id, "notes", value)} ariaLabel={`Notes for ${label}`} placeholder="Notes" multiline />
      </td>
      <td className="min-w-[120px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.cleaning, currency)} /></td>
      <td className="min-w-[136px] px-2 py-3">
        <ScheduleNumberField value={row.lien_search} onChange={(value) => onChange(row.lot_id, "lien_search", value)} ariaLabel={`Lien search cost for ${label}`} />
      </td>
      <td className="min-w-[136px] px-2 py-3">
        <ScheduleNumberField value={row.video_cost} onChange={(value) => onChange(row.lot_id, "video_cost", value)} ariaLabel={`Video cost for ${label}`} />
      </td>
      <td className="min-w-[132px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.lottingFee, currency)} /></td>
      <td className="min-w-[132px] px-2 py-3"><ReadOnlyScheduleValue value={formatMoney(display.advertising, currency)} /></td>
    </tr>
  );
});

function MobileSection({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]"
    >
      <summary className="cursor-pointer select-none px-3 py-3 text-sm font-bold text-[var(--app-text-strong)]">
        {title}
      </summary>
      <div className="border-t border-[var(--app-border)] p-3">{children}</div>
    </details>
  );
}

function MobileLabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-[var(--app-text-muted)]">{label}</p>
      <ReadOnlyScheduleValue value={value} align="left" />
    </div>
  );
}

const MobileValuationCard = memo(function MobileValuationCard({
  row,
  evaluators,
  currency,
  onChange,
  onEvaluatorChange,
  onOpenGallery,
}: {
  row: ProposalValuationRow;
  evaluators: ProposalValuationEvaluator[];
  currency: string;
  onChange: RowChange;
  onEvaluatorChange: EvaluatorChange;
  onOpenGallery: OpenPictureGallery;
}) {
  const display = rowDisplayValues(row, evaluators);
  const label = assetLabel(row);
  const count = pictureCount(row);

  return (
    <article
      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "640px" }}
    >
      <div className="flex gap-3">
        <div className="shrink-0">
          <PictureSummary row={row} onOpen={onOpenGallery} thumbnailOnly />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[var(--app-text-strong)]">
            {label}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--app-text-muted)]">
            {[row.year, row.make, row.model].filter(Boolean).join(" ") || row.asset_category}
          </p>
          <p className="mt-2 text-lg font-bold tabular-nums text-[var(--app-accent)]">
            {formatMoney(display.average, currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--app-text-muted)]">{count} picture{count === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <MobileSection title="Asset details" initiallyOpen>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["Asset Category", "asset_category"],
              ["Year", "year"],
              ["Make", "make"],
              ["Model", "model"],
              ["Serial Number", "serial_number"],
              ["Condition (1-5)", "condition_score"],
            ] as const).map(([fieldLabel, key]) => (
              <label key={key} className="min-w-0 text-xs font-semibold text-[var(--app-text-muted)]">
                {fieldLabel}
                <span className="mt-1 block">
                  <ScheduleTextField value={row[key]} onChange={(value) => onChange(row.lot_id, key, value)} ariaLabel={`${fieldLabel} for ${label}`} />
                </span>
              </label>
            ))}
          </div>
          <label className="mt-3 block text-xs font-semibold text-[var(--app-text-muted)]">
            CR Details
            <span className="mt-1 block"><ScheduleTextField value={row.cr_details} onChange={(value) => onChange(row.lot_id, "cr_details", value)} ariaLabel={`CR details for ${label}`} multiline /></span>
          </label>
          <label className="mt-3 block text-xs font-semibold text-[var(--app-text-muted)]">
            Location (City, State/Prov)
            <span className="mt-1 block"><ScheduleTextField value={row.location} onChange={(value) => onChange(row.lot_id, "location", value)} ariaLabel={`Location for ${label}`} placeholder="City, State/Prov" /></span>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MobileLabeledValue label="Pictures" value={`${count} picture${count === 1 ? "" : "s"}`} />
            <MobileLabeledValue label="Asset Insight" value={row.asset_insight || "-"} />
          </div>
        </MobileSection>

        <MobileSection title="Evaluator values">
          <div className="grid grid-cols-2 gap-2">
            {evaluators.map((column) => (
              <label key={column.id} className="min-w-0 text-xs font-semibold text-[var(--app-text-muted)]">
                {column.name}
                <span className="mt-1 block"><ScheduleNumberField value={row.evaluator_values?.[column.id] ?? null} onChange={(value) => onEvaluatorChange(row.lot_id, column.id, value)} ariaLabel={`${column.name} valuation for ${label}`} /></span>
              </label>
            ))}
            <MobileLabeledValue label="Average" value={formatMoney(display.average, currency)} />
          </div>
        </MobileSection>

        <MobileSection title="Estimated values">
          <div className="grid grid-cols-2 gap-2">
            <MobileLabeledValue label="Low Est. Sale Value" value={formatMoney(display.low, currency)} />
            <MobileLabeledValue label="High Est. Sale Value" value={formatMoney(display.high, currency)} />
            <MobileLabeledValue label="Buyer Premium %" value={`${display.buyerPremiumPercent}%`} />
            <MobileLabeledValue label="Buyer Premium" value={formatMoney(display.buyerPremiumAmount, currency)} />
            <MobileLabeledValue label="Total Expected Gross" value={formatMoney(display.totalExpectedGross, currency)} />
            <MobileLabeledValue label="Allocated Value" value={formatMoney(display.allocatedValue, currency)} />
          </div>
        </MobileSection>

        <MobileSection title="Costs & notes">
          <div className="grid grid-cols-2 gap-2">
            <MobileLabeledValue label="Cleaning" value={formatMoney(display.cleaning, currency)} />
            <MobileLabeledValue label="Lotting Fee" value={formatMoney(display.lottingFee, currency)} />
            <MobileLabeledValue label="Advertising" value={formatMoney(display.advertising, currency)} />
            <label className="min-w-0 text-xs font-semibold text-[var(--app-text-muted)]">Lien Search<span className="mt-1 block"><ScheduleNumberField value={row.lien_search} onChange={(value) => onChange(row.lot_id, "lien_search", value)} ariaLabel={`Lien search cost for ${label}`} /></span></label>
            <label className="min-w-0 text-xs font-semibold text-[var(--app-text-muted)]">Video Cost<span className="mt-1 block"><ScheduleNumberField value={row.video_cost} onChange={(value) => onChange(row.lot_id, "video_cost", value)} ariaLabel={`Video cost for ${label}`} /></span></label>
          </div>
          <label className="mt-3 block text-xs font-semibold text-[var(--app-text-muted)]">Notes<span className="mt-1 block"><ScheduleTextField value={row.notes} onChange={(value) => onChange(row.lot_id, "notes", value)} ariaLabel={`Notes for ${label}`} multiline /></span></label>
        </MobileSection>
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
  const [pictureGallery, setPictureGallery] = useState<PictureGalleryState | null>(null);
  const galleryPanelRef = useRef<HTMLElement | null>(null);
  const galleryOpenerRef = useRef<HTMLButtonElement | null>(null);
  const restoreGalleryFocusRef = useRef(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const currency = payload?.currencyCode || "CAD";

  const openPictureGallery = useCallback<OpenPictureGallery>(
    (label, urls, opener) => {
      const availableUrls = urls
        .map((url) => String(url || "").trim())
        .filter(Boolean);
      if (!availableUrls.length) return;
      galleryOpenerRef.current = opener;
      restoreGalleryFocusRef.current = false;
      setPictureGallery({ label, urls: availableUrls, index: 0 });
    },
    []
  );

  const closePictureGallery = useCallback(() => {
    restoreGalleryFocusRef.current = true;
    setPictureGallery(null);
  }, []);

  const movePictureGallery = useCallback((offset: number) => {
    setPictureGallery((current) => {
      if (!current || current.urls.length <= 1) return current;
      const index =
        (current.index + offset + current.urls.length) % current.urls.length;
      return { ...current, index };
    });
  }, []);

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
    restoreGalleryFocusRef.current = false;
    galleryOpenerRef.current = null;
    setPictureGallery(null);
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (pictureGallery || !restoreGalleryFocusRef.current) return;
    restoreGalleryFocusRef.current = false;
    galleryOpenerRef.current?.focus({ preventScroll: true });
  }, [pictureGallery]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pictureGallery) {
          closePictureGallery();
        } else {
          close();
        }
        return;
      }
      if (!pictureGallery) return;
      if (event.key === "Tab") {
        const panel = galleryPanelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (!focusable.length) {
          event.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const focusIsOutside = !panel.contains(active);
        if (event.shiftKey && (active === first || focusIsOutside)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (active === last || focusIsOutside)) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePictureGallery(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        movePictureGallery(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    close,
    closePictureGallery,
    movePictureGallery,
    open,
    pictureGallery,
  ]);

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
    () =>
      sheet
        ? proposalValuationTotals(recalculateProposalValuationSheet(sheet))
        : null,
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

  const updateFileSummary = useCallback<FileSummaryChange>((key, value) => {
    setSheet((current) =>
      current
        ? {
            ...current,
            file_summary: { ...current.file_summary, [key]: value },
          }
        : current
    );
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
    <>
    <div
      className="fixed inset-0 z-[120] flex bg-black/55 p-0 backdrop-blur-sm sm:p-3 lg:p-5"
      role="dialog"
      aria-modal={pictureGallery ? undefined : true}
      aria-label="Proposal Valuation"
      aria-hidden={pictureGallery ? true : undefined}
      inert={pictureGallery ? true : undefined}
    >
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
              aria-label={saving ? "Saving Proposal Valuation" : "Save & update files"}
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
                          <th colSpan={2} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Identity</th>
                          <th colSpan={9} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Asset details</th>
                          <th colSpan={sheet.evaluator_columns.length + 1} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Evaluator values</th>
                          <th colSpan={2} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Estimated sale values</th>
                          <th colSpan={2} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Buyer premium</th>
                          <th colSpan={2} className="border-b border-r border-[var(--app-border)] px-2 py-2 text-center">Totals</th>
                          <th colSpan={6} className="border-b border-[var(--app-border)] px-2 py-2 text-center">Costs &amp; notes</th>
                        </tr>
                        <tr>
                          <th className="sticky left-0 z-[4] min-w-[120px] bg-[var(--app-panel-alt)] px-2 py-2.5">Asset ID</th>
                          <th className="min-w-[184px] px-2 py-2.5">Asset Category</th>
                          <th className="min-w-[104px] px-2 py-2.5">Year</th>
                          <th className="min-w-[136px] px-2 py-2.5">Make</th>
                          <th className="min-w-[152px] px-2 py-2.5">Model</th>
                          <th className="min-w-[184px] px-2 py-2.5">Serial Number</th>
                          <th className="min-w-[280px] px-2 py-2.5">CR Details</th>
                          <th className="min-w-[144px] px-2 py-2.5">Condition (1-5)</th>
                          <th className="min-w-[220px] px-2 py-2.5">Location (City, State/Prov)</th>
                          <th className="min-w-[120px] px-2 py-2.5">Pictures</th>
                          <th className="min-w-[176px] px-2 py-2.5">Asset Insight</th>
                          {sheet.evaluator_columns.map((column) => <th key={column.id} className="min-w-[152px] px-2 py-2.5 text-right">{column.name}</th>)}
                          <th className="min-w-[144px] px-2 py-2.5 text-right">Average</th>
                          <th className="min-w-[160px] px-2 py-2.5 text-right">Low Est. Sale Value ($)</th>
                          <th className="min-w-[160px] px-2 py-2.5 text-right">High Est. Sale Value ($)</th>
                          <th className="min-w-[128px] px-2 py-2.5 text-right">Buyer Premium %</th>
                          <th className="min-w-[152px] px-2 py-2.5 text-right">Buyer Premium ($)</th>
                          <th className="min-w-[176px] px-2 py-2.5 text-right">Total Expected Gross ($)</th>
                          <th className="min-w-[152px] px-2 py-2.5 text-right">Allocated Value ($)</th>
                          <th className="min-w-[220px] px-2 py-2.5">Notes</th>
                          <th className="min-w-[120px] px-2 py-2.5 text-right">Cleaning</th>
                          <th className="min-w-[136px] px-2 py-2.5 text-right">Lien Search</th>
                          <th className="min-w-[136px] px-2 py-2.5 text-right">Video Cost</th>
                          <th className="min-w-[132px] px-2 py-2.5 text-right">Lotting Fee</th>
                          <th className="min-w-[132px] px-2 py-2.5 text-right">Advertising</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => <ValuationRow key={row.lot_id} row={row} evaluators={sheet.evaluator_columns} currency={currency} onChange={updateRow} onEvaluatorChange={updateEvaluatorValue} onOpenGallery={openPictureGallery} />)}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:hidden">
                    {filteredRows.map((row) => <MobileValuationCard key={row.lot_id} row={row} evaluators={sheet.evaluator_columns} currency={currency} onChange={updateRow} onEvaluatorChange={updateEvaluatorValue} onOpenGallery={openPictureGallery} />)}
                  </div>
                  {!filteredRows.length ? <div className="rounded-lg border border-dashed border-[var(--app-border)] p-10 text-center text-sm text-[var(--app-text-muted)]">No assets match this search.</div> : null}
                </div>
              ) : (
                <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_1fr] lg:p-6">
                  <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                    <h3 className="text-base font-bold text-[var(--app-text-strong)]">Proposal controls</h3>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">Edit the same file-level controls used by the Schedule A admin view.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Buyer premium basis
                        <select value={sheet.file_summary.buyers_premium_basis} onChange={(event) => updateFileSummary("buyers_premium_basis", event.target.value === "capped" ? "capped" : "uncapped")} className="mt-1 h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-input)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"><option value="uncapped">Uncapped</option><option value="capped">Capped</option></select>
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Total risk-weighted value
                        <input type="number" min="0" step="0.01" value={sheet.file_summary.total_risk_weighted_value ?? ""} onChange={(event) => updateFileSummary("total_risk_weighted_value", parseNumber(event.target.value))} className={`mt-1 h-10 ${numericControlClass}`} />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">File risk multiplier
                        <input type="number" min="0" step="0.01" value={sheet.file_summary.file_risk_multiplier ?? ""} onChange={(event) => updateFileSummary("file_risk_multiplier", parseNumber(event.target.value))} className={`mt-1 h-10 ${numericControlClass}`} />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Offer 2 NMG (%)
                        <input type="number" min="0" max="100" step="0.1" value={(sheet.file_summary.offer2_nmg_percent * 100).toFixed(1)} onChange={(event) => updateFileSummary("offer2_nmg_percent", Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100)} className={`mt-1 h-10 ${numericControlClass}`} />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Capped threshold (%)
                        <input type="number" min="0" max="100" step="0.1" value={(sheet.file_summary.capped_threshold_percent * 100).toFixed(1)} onChange={(event) => updateFileSummary("capped_threshold_percent", Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100)} className={`mt-1 h-10 ${numericControlClass}`} />
                      </label>
                      <label className="text-xs font-bold text-[var(--app-text-muted)]">Commission without guarantee (%)
                        <input type="number" min="0" step="0.1" value={sheet.file_summary.commission_percent_no_guarantee ?? ""} onChange={(event) => updateFileSummary("commission_percent_no_guarantee", parseNumber(event.target.value))} className={`mt-1 h-10 ${numericControlClass}`} />
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
      {pictureGallery ? (
        <div
          className="fixed inset-0 z-[140] grid place-items-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Pictures for ${pictureGallery.label}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePictureGallery();
          }}
        >
          <section
            ref={galleryPanelRef}
            tabIndex={-1}
            className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#080b12] text-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold sm:text-base">
                  Pictures for {pictureGallery.label}
                </h3>
                <p className="mt-0.5 text-xs text-white/65" aria-live="polite">
                  {pictureGallery.index + 1} of {pictureGallery.urls.length}
                </p>
              </div>
              <button
                type="button"
                onClick={closePictureGallery}
                autoFocus
                className="grid size-10 shrink-0 place-items-center rounded-md border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label="Close picture gallery"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-black p-2 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pictureGallery.urls[pictureGallery.index]}
                alt={`${pictureGallery.label} picture ${pictureGallery.index + 1}`}
                className="max-h-[calc(100vh-10rem)] max-w-full object-contain"
              />
              {pictureGallery.urls.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => movePictureGallery(-1)}
                    className="absolute left-3 grid size-11 place-items-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-5"
                    aria-label="Previous picture"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePictureGallery(1)}
                    className="absolute right-3 grid size-11 place-items-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-5"
                    aria-label="Next picture"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
