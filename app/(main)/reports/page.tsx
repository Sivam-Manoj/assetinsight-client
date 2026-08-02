"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Merge,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { ReportsService, type PdfReport } from "@/services/reports";
import { deleteAssetReport, getAssetReports, resubmitReport, type AssetReport } from "@/services/assets";
import { deleteLotListing, getLotListings, resubmitLotListing, type LotListing } from "@/services/lotListing";
import {
  RealEstateService,
  type RealEstateReport,
} from "@/services/realEstate";
import AuctioneerService, {
  type AuctioneerDeliverySummary,
} from "@/services/auctioneer";
import { ReportThumbnail } from "@/components/reports/ReportThumbnail";

const AssetMergeDialog = dynamic(
  () => import("@/components/reports/AssetMergeDialog"),
  { ssr: false }
);
const AuctioneerDeliveryDialog = dynamic(
  () => import("@/components/reports/AuctioneerDeliveryDialog"),
  { ssr: false }
);

type ReportGroup = {
  key: string;
  address: string;
  filename?: string;
  fairMarketValue: string;
  createdAt: string;
  contract_no?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  release_status?: "pending_release" | "released";
  released_at?: string | null;
  downloadable?: boolean;
  isGeneratingFiles?: boolean;
  generationState?: "queued" | "processing" | "ready" | "error";
  workflowStage?: string;
  workflowMessage?: string;
  workflowProgressPercent?: number;
  generationProgress?: {
    progressPercent?: number;
    message?: string;
    currentLot?: number;
    totalLots?: number;
  };
  jobError?: string;
  reportStatus?: string;
  lotSummary?: string;
  lotCount?: number;
  thumbnail?: string;
  type?: string;
  isMergedReport?: boolean;
  mergedSourceCount?: number;
  auctioneerDelivery?: AuctioneerDeliverySummary;
  variants: {
    pdf?: PdfReport;
    specPdf?: PdfReport;
    crDocx?: PdfReport;
    docx?: PdfReport;
    xlsx?: PdfReport;
    images?: PdfReport;
  };
};

function auctioneerDeliveryPresentation(
  delivery?: AuctioneerDeliverySummary
): { label: string; color: string; bg: string } | null {
  if (!delivery) return null;
  const values: Record<string, { label: string; color: string; bg: string }> = {
    not_ready: {
      label: "Auctioneer: not ready",
      color: "#64748b",
      bg: "rgba(100,116,139,0.12)",
    },
    ready: {
      label: "Ready to Send",
      color: "#2563eb",
      bg: "rgba(37,99,235,0.12)",
    },
    queued: {
      label: "Sending",
      color: "#2563eb",
      bg: "rgba(37,99,235,0.12)",
    },
    sending: {
      label: "Sending",
      color: "#2563eb",
      bg: "rgba(37,99,235,0.12)",
    },
    failed: {
      label: "Failed — Retry",
      color: "#dc2626",
      bg: "rgba(220,38,38,0.12)",
    },
    needs_reconciliation: {
      label: "Needs Reconciliation",
      color: "#b45309",
      bg: "rgba(217,119,6,0.12)",
    },
    sent: {
      label: "Sent",
      color: "#087a43",
      bg: "#e8f7ee",
    },
  };
  return values[delivery.state] || values.not_ready;
}
function typeLabel(type?: string) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "realestate" || normalized.includes("real")) {
    return "Real Estate";
  }
  if (normalized === "lotlisting" || normalized.includes("lot")) {
    return "Lot Listing";
  }
  if (normalized.includes("salvage")) {
    return "Salvage";
  }
  return "Asset";
}

function isFileGenerationActive(report: any) {
  if (["preparing_preview", "generating_files"].includes(report?.workflow_stage)) return true;
  if (["preview_ready", "awaiting_approval", "awaiting_release", "ready", "error"].includes(report?.workflow_stage)) return false;
  if (report?.generation_state === "error") return false;
  if (report?.generation_state === "queued" || report?.generation_state === "processing") {
    return true;
  }
  return (
    Boolean(report?.files_generating) ||
    Boolean(report?.files_regenerating) ||
    report?.status === "processing" ||
    report?.job_status === "queued" ||
    report?.job_status === "processing"
  );
}

function summarizeLotNumbers(lots: any[], fallbackId: string) {
  const numbers = (Array.isArray(lots) ? lots : [])
    .map((lot) => String(lot?.lot_number ?? "").trim())
    .filter(Boolean);
  if (numbers.length > 0) {
    const first = numbers.slice(0, 3).map((value) => `Lot ${value}`).join(", ");
    return numbers.length > 3 ? `${first} +${numbers.length - 3}` : first;
  }
  return `#${String(fallbackId).slice(-6)}`;
}

function statusTone(
  status?: string,
  isGeneratingFiles = false,
  releaseStatus?: string,
  generationState?: string,
  reportStatus?: string,
  workflowStage?: string
) {
  const workflowLabels: Record<string, { bg: string; color: string; label: string }> = {
    preparing_preview: { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Preparing preview" },
    preview_ready: { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Preview ready" },
    generating_files: { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Generating files" },
    awaiting_approval: { bg: "rgba(217,119,6,0.12)", color: "#d97706", label: "Awaiting approval" },
    awaiting_release: { bg: "rgba(217,119,6,0.12)", color: "#d97706", label: "Awaiting release" },
    ready: { bg: "#e8f7ee", color: "#087a43", label: "Ready to download" },
    error: { bg: "rgba(220,38,38,0.12)", color: "#dc2626", label: "Generation failed" },
  };
  if (workflowStage && workflowLabels[workflowStage]) return workflowLabels[workflowStage];
  if (reportStatus === "processing") {
    return { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Preparing preview" };
  }
  if (reportStatus === "preview" && isGeneratingFiles) {
    return { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Preparing preview" };
  }
  if (reportStatus === "preview") {
    return { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Preview ready" };
  }
  if (reportStatus === "declined") {
    return { bg: "rgba(220,38,38,0.12)", color: "#dc2626", label: "Changes required" };
  }
  if (generationState === "error") {
    return { bg: "rgba(220,38,38,0.12)", color: "#dc2626", label: "Generation failed" };
  }
  if (isGeneratingFiles) {
    return {
      bg: "rgba(37,99,235,0.12)",
      color: "#2563eb",
      label: "Generating files",
    };
  }
  if (status === "approved" && releaseStatus === "pending_release") {
    return {
      bg: "rgba(217,119,6,0.12)",
      color: "#d97706",
      label: "Awaiting release",
    };
  }
  if (status === "approved" && releaseStatus === "released") {
    return { bg: "#e8f7ee", color: "#087a43", label: "Released" };
  }
  if (status === "approved") {
    return { bg: "#e8f7ee", color: "#087a43", label: "Approved" };
  }
  if (status === "rejected") {
    return { bg: "rgba(220,38,38,0.12)", color: "#dc2626", label: "Rejected" };
  }
  return {
    bg: "rgba(217,119,6,0.12)",
    color: "#d97706",
    label: "Awaiting approval",
  };
}

function actionLabel(variant: "pdf" | "specPdf" | "crDocx" | "docx" | "xlsx" | "images") {
  if (variant === "pdf") return "Data";
  if (variant === "specPdf") return "CR";
  if (variant === "crDocx") return "CR DOCX";
  if (variant === "docx") return "DOCX";
  if (variant === "xlsx") return "Excel";
  return "Images";
}

function hasReportFileUrls(report: any) {
  const keys = ["pdf", "spec_pdf", "cr_docx", "docx", "excel", "xlsx", "images", "zip"];
  const sources = [report?.preview_files, report?.files];
  return sources.some((source) => {
    if (!source || typeof source !== "object") return false;
    return keys.some((key) => {
      const value = source[key];
      return typeof value === "string" && value.trim().length > 0;
    });
  });
}

function isFileGenerationBlocking(report: any) {
  return isFileGenerationActive(report) && !hasReportFileUrls(report);
}

function hasGroupDownloadVariants(group: ReportGroup) {
  return Object.values(group.variants).some((variant) => {
    if (!variant) return false;
    const url = (variant as any).url;
    if (typeof url === "string" && url.trim()) {
      return !url.startsWith("/api/reports/");
    }
    return !variant.crReportId;
  });
}

function fileActionIcon(
  variant: "pdf" | "specPdf" | "crDocx" | "docx" | "xlsx" | "images"
) {
  if (variant === "xlsx") return <FileSpreadsheet className="size-4" />;
  if (variant === "images") return <FileArchive className="size-4" />;
  if (variant === "specPdf") return <FileImage className="size-4" />;
  return <FileText className="size-4" />;
}

function imageUrlsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFirstReportImage(lots: any[], report: any): string | undefined {
  const explicitThumbnail = [
    report?.thumbnail_url,
    report?.thumbnailUrl,
    report?.preview_data?.thumbnail_url,
    report?.preview_data?.thumbnailUrl,
  ].find((value) => typeof value === "string" && value.trim());
  if (explicitThumbnail) return explicitThumbnail.trim();

  const globalImages = [
    ...imageUrlsFrom(report?.preview_data?.image_urls),
    ...imageUrlsFrom(report?.preview_data?.imageUrls),
    ...imageUrlsFrom(report?.preview_data?.extra_image_urls),
    ...imageUrlsFrom(report?.preview_data?.extraImageUrls),
    ...imageUrlsFrom(report?.image_urls),
    ...imageUrlsFrom(report?.imageUrls),
    ...imageUrlsFrom(report?.extra_image_urls),
    ...imageUrlsFrom(report?.extraImageUrls),
  ];

  for (const lot of Array.isArray(lots) ? lots : []) {
    const lotImages = [
      ...imageUrlsFrom(lot?.image_urls),
      ...imageUrlsFrom(lot?.extra_image_urls),
    ];
    const coverIndex = Number(lot?.cover_index ?? lot?.coverIndex);
    if (
      Number.isInteger(coverIndex) &&
      coverIndex >= 0 &&
      lotImages[coverIndex]
    ) {
      return lotImages[coverIndex];
    }

    const direct = [
      lot?.image_url,
      ...lotImages,
    ].find((value) => typeof value === "string" && value.trim());
    if (direct) return direct.trim();

    const firstIndex = [
      ...(Array.isArray(lot?.image_indexes) ? lot.image_indexes : []),
      ...(Array.isArray(lot?.extra_image_indexes) ? lot.extra_image_indexes : []),
    ].find((value) => Number.isInteger(Number(value)));
    if (firstIndex !== undefined && globalImages[Number(firstIndex)]) {
      return globalImages[Number(firstIndex)];
    }
  }

  return globalImages[0];
}

function GeneratingFilesProgress({
  progress,
  fallbackMessage = "Generating updated files...",
}: {
  progress?: ReportGroup["generationProgress"];
  fallbackMessage?: string;
}) {
  const percent = Math.max(2, Math.min(100, Number(progress?.progressPercent || 0)));
  return (
    <div className="min-w-44 space-y-1.5">
      <p className="text-xs font-semibold text-[var(--app-accent)]">
        {progress?.message || fallbackMessage}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--app-panel-alt)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span
          className="block h-full rounded-full bg-[var(--app-accent)] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress?.totalLots ? (
        <p className="text-xs text-[var(--app-text-muted)]">
          Lot {progress.currentLot || 0} of {progress.totalLots} ·{" "}
          {Math.round(percent)}%
        </p>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<PdfReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<
    "date-desc" | "date-asc" | "value-desc" | "value-asc"
  >("date-desc");
  const [typeFilter, setTypeFilter] = useState("");
  const [assetReports, setAssetReports] = useState<AssetReport[]>([]);
  const [realEstateReports, setRealEstateReports] = useState<RealEstateReport[]>([]);
  const [lotListingReports, setLotListingReports] = useState<LotListing[]>([]);
  const [auctioneerDeliveries, setAuctioneerDeliveries] = useState<
    AuctioneerDeliverySummary[]
  >([]);
  const [mergeAnchorId, setMergeAnchorId] = useState<string | null>(null);
  const [deliveryDialogItem, setDeliveryDialogItem] =
    useState<AuctioneerDeliverySummary | null>(null);
  const loadingReportsRef = useRef(false);

  useEffect(() => {
    const globalSearchQuery =
      new URLSearchParams(window.location.search).get("search")?.trim() || "";
    setQuery(globalSearchQuery);
  }, []);

  const hasActiveJobs = useMemo(
    () =>
      [...assetReports, ...realEstateReports, ...lotListingReports].some(
        isFileGenerationActive
      ) ||
      auctioneerDeliveries.some((delivery) =>
        ["queued", "sending"].includes(delivery.state)
      ),
    [assetReports, auctioneerDeliveries, realEstateReports, lotListingReports]
  );

  const loadReports = useCallback(async (
    options: { showLoading?: boolean; silent?: boolean; successToast?: boolean } = {}
  ) => {
    if (loadingReportsRef.current) return false;
    loadingReportsRef.current = true;
    const showFullLoading = options.showLoading === true;
    try {
      if (showFullLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      const [
        legacy,
        assetResponse,
        realEstateResponse,
        lotListingResponse,
        deliveryResponse,
      ] =
        await Promise.all([
          ReportsService.getMyReports(),
          getAssetReports().catch(() => ({ data: [] })),
          RealEstateService.getReports().catch(() => ({ data: [] })),
          getLotListings().catch(() => ({ data: [] })),
          AuctioneerService.getDeliveries().catch(() => []),
        ]);

      setReports(legacy);
      setAssetReports(
        assetResponse.data.filter(
          (report) =>
            report.status === "approved" ||
            report.status === "pending_approval" ||
            (report as any).status === "error" ||
            (report as any).generation_state === "error" ||
            isFileGenerationActive(report)
        )
      );
      setRealEstateReports(
        realEstateResponse.data.filter(
          (report) =>
            report.status === "approved" ||
            report.status === "pending_approval" ||
            (report as any).status === "error" ||
            (report as any).generation_state === "error" ||
            isFileGenerationActive(report)
        )
      );
      setLotListingReports(
        lotListingResponse.data.filter(
          (report) =>
            report.status === "approved" ||
            report.status === "pending_approval" ||
            report.status === "error" ||
            (report as any).generation_state === "error" ||
            isFileGenerationActive(report)
          )
      );
      setAuctioneerDeliveries(deliveryResponse);
      setError(null);
      if (options.successToast) {
        toast.success("Reports refreshed.");
      }
      return true;
    } catch (loadError: any) {
      if (!options.silent) {
        setError(
          loadError?.response?.data?.message ||
            loadError?.message ||
            "Failed to load reports"
        );
      }
      return false;
    } finally {
      if (showFullLoading) setLoading(false);
      setRefreshing(false);
      loadingReportsRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadReports({ showLoading: true });

    const handler = () => void loadReports({ silent: true });
    const visibilityHandler = () => {
      if (!document.hidden) void loadReports({ silent: true });
    };
    window.addEventListener("cv:report-created", handler as any);
    window.addEventListener("focus", handler);
    window.addEventListener("pageshow", handler);
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      window.removeEventListener("cv:report-created", handler as any);
      window.removeEventListener("focus", handler);
      window.removeEventListener("pageshow", handler);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [loadReports]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadReports({ silent: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveJobs, loadReports]);

  const handleManualRefresh = async () => {
    await loadReports({ successToast: true });
  };

  async function handleDelete(group: ReportGroup) {
    if (deletingKey) return;
    const label = group.contract_no || group.address || typeLabel(group.type);
    if (!confirm(`Delete ${label}? This action cannot be undone.`)) return;

    try {
      setDeletingKey(group.key);
      const normalized = String(group.type || "").toLowerCase();

      if (normalized === "asset") {
        await deleteAssetReport(group.key);
      } else if (normalized === "realestate" || normalized.includes("real")) {
        await RealEstateService.deleteReport(group.key);
      } else if (normalized === "lotlisting" || normalized.includes("lot")) {
        await deleteLotListing(group.key);
      } else {
        await ReportsService.deleteReport(group.key);
      }

      toast.success("Report deleted");
      await loadReports();
    } catch (deleteError: any) {
      toast.error(
        deleteError?.response?.data?.message ||
          deleteError?.message ||
          "Failed to delete report"
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleRetry(group: ReportGroup) {
    try {
      const type = String(group.type || "").toLowerCase();
      if (type === "asset") await resubmitReport(group.key);
      else if (type.includes("lot")) await resubmitLotListing(group.key);
      else throw new Error("Open the report preview to retry this report type.");
      toast.success("File generation queued again.");
      await loadReports();
    } catch (retryError: any) {
      toast.error(retryError?.response?.data?.message || retryError?.message || "Retry failed");
    }
  }

  const groups = useMemo<ReportGroup[]>(() => {
    const map = new Map<string, ReportGroup>();
    const assetReportIds = new Set(assetReports.map((report) => report._id));
    const realEstateReportIds = new Set(
      realEstateReports.map((report) => report._id)
    );
    const lotListingReportIds = new Set(
      lotListingReports.map((report) => report._id)
    );

    const getReportRefId = (report: any): string | undefined => {
      const raw = report?.report;
      if (!raw) return undefined;
      if (typeof raw === "string") return raw;
      if (typeof raw === "object" && raw?._id) return String(raw._id);
      return String(raw);
    };

    for (const report of reports) {
      const reportRef = getReportRefId(report);
      if (
        reportRef &&
        (assetReportIds.has(reportRef) ||
          realEstateReportIds.has(reportRef) ||
          lotListingReportIds.has(reportRef))
      ) {
        continue;
      }

      const key = String(reportRef || report._id);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          address: report.address || "",
          filename: report.filename,
          fairMarketValue: report.fairMarketValue || "",
          createdAt: report.createdAt,
          contract_no: (report as any).contract_no,
          approvalStatus: report.approvalStatus,
          release_status: (report as any).release_status,
          released_at: (report as any).released_at,
          downloadable: (report as any).downloadable !== false,
          isGeneratingFiles: false,
          generationState: "ready",
          reportStatus: String((report as any).status || "approved"),
          lotCount: Number((report as any).lot_count || 0),
          thumbnail: getFirstReportImage([], report),
          type: (report as any).type,
          variants: {},
        };
        map.set(key, group);
      }

      const fileType = (
        (report.fileType || String(report.filename || "").split(".").pop() || "") as string
      ).toLowerCase();
      if (fileType === "pdf") group.variants.pdf = report;
      else if (fileType === "spec_pdf") group.variants.specPdf = report;
      else if (fileType === "cr_docx") group.variants.crDocx = report;
      else if (fileType === "docx") group.variants.docx = report;
      else if (fileType === "xlsx") group.variants.xlsx = report;
      else if (fileType === "images" || fileType === "zip") group.variants.images = report;
    }

    for (const asset of assetReports) {
      const previewFiles = (asset as any).preview_files || {};
      const currency = String(
        (asset as any)?.preview_data?.currency || (asset as any)?.currency || "CAD"
      ).toUpperCase();
      const lots = Array.isArray((asset as any)?.preview_data?.lots)
        ? (asset as any).preview_data.lots
        : Array.isArray((asset as any)?.lots)
          ? (asset as any).lots
          : [];
      const total = lots.reduce((sum: number, lot: any) => {
        const lotValue = Number(
          String(lot?.estimated_value || "").replace(/[^0-9.-]+/g, "")
        );
        const itemValue = Array.isArray(lot?.items)
          ? lot.items.reduce((itemSum: number, item: any) => {
              const parsed = Number(
                String(item?.estimated_value || "").replace(/[^0-9.-]+/g, "")
              );
              return itemSum + (Number.isFinite(parsed) ? parsed : 0);
            }, 0)
          : 0;
        return sum + Math.max(Number.isFinite(lotValue) ? lotValue : 0, itemValue);
      }, 0);
      const fairMarketValue =
        total > 0
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency,
              maximumFractionDigits: 0,
            }).format(total)
          : `${currency} 0.00`;
      const addressBase =
        (asset as any).client_name ||
        (asset as any).preview_data?.client_name ||
        "Asset Report";

      const createPseudoReport = (url: string, fileType: string, extra?: Partial<PdfReport>) =>
        ({
          _id: `${asset._id}-${fileType}`,
          filename: `${addressBase}.${fileType}`,
          fileType,
          url,
          ...extra,
          address: addressBase,
          fairMarketValue,
          createdAt: asset.createdAt,
          approvalStatus: asset.status === "approved" ? "approved" : "pending",
          release_status: (asset as any).release_status,
          released_at: (asset as any).released_at,
          downloadable: (asset as any).downloadable !== false,
        }) as PdfReport;
      const isGenerating = isFileGenerationBlocking(asset);
      const isDownloadable = (asset as any).downloadable !== false;

      map.set(asset._id, {
        key: asset._id,
        address: addressBase,
        filename: `${addressBase}.docx`,
        fairMarketValue,
        createdAt: asset.createdAt,
        contract_no:
          (asset as any).contract_no || (asset as any).preview_data?.contract_no,
        approvalStatus: asset.status === "approved" ? "approved" : "pending",
        release_status: (asset as any).release_status,
        released_at: (asset as any).released_at,
        downloadable: isDownloadable,
        isGeneratingFiles: isGenerating,
        generationState: (asset as any).generation_state,
        workflowStage: (asset as any).workflow_stage,
        workflowMessage: (asset as any).workflow_message,
        workflowProgressPercent: (asset as any).workflow_progress_percent,
        reportStatus: asset.status,
        generationProgress: (asset as any).generation_progress,
        jobError: (asset as any).job_error,
        lotSummary: summarizeLotNumbers(lots, asset._id),
        lotCount: lots.length,
        thumbnail: getFirstReportImage(lots, asset),
        type: "Asset",
        isMergedReport: (asset as any).is_merged_report === true,
        mergedSourceCount: Array.isArray((asset as any).merged_from_report_ids)
          ? (asset as any).merged_from_report_ids.length
          : 0,
        variants: {
          pdf: previewFiles.pdf ? createPseudoReport(previewFiles.pdf, "pdf") : undefined,
          specPdf: previewFiles.spec_pdf
            ? createPseudoReport(previewFiles.spec_pdf, "pdf", {
                _id: `${asset._id}-cr`,
                filename: `${addressBase}-CR.pdf`,
                fileType: "spec_pdf",
                crReportId: asset._id,
              })
            : undefined,
          crDocx: previewFiles.cr_docx
            ? createPseudoReport(previewFiles.cr_docx, "docx", {
                _id: `${asset._id}-cr-docx`,
                filename: `${addressBase}-CR.docx`,
                fileType: "cr_docx",
                crReportId: asset._id,
              })
            : isDownloadable ? createPseudoReport(`/api/reports/${asset._id}/cr-docx`, "docx", {
                _id: `${asset._id}-cr-docx`,
                filename: `${addressBase}-CR.docx`,
                fileType: "cr_docx",
                crReportId: asset._id,
              }) : undefined,
          docx: previewFiles.docx
            ? createPseudoReport(previewFiles.docx, "docx")
            : undefined,
          xlsx: previewFiles.excel
            ? createPseudoReport(previewFiles.excel, "xlsx")
            : undefined,
          images: previewFiles.images
            ? createPseudoReport(previewFiles.images, "zip")
            : undefined,
        },
      });
    }

    for (const report of realEstateReports) {
      const previewFiles = (report as any).preview_files || {};
      const addressBase =
        (report as any)?.property_details?.address ||
        (report as any)?.preview_data?.property_details?.address ||
        "Real Estate Report";
      const fairMarketValue = String(
        (report as any)?.preview_data?.valuation?.fair_market_value ||
          (report as any)?.valuation?.fair_market_value ||
          "CAD —"
      );
      const createPseudoReport = (url: string, fileType: string) =>
        ({
          _id: `${report._id}-${fileType}`,
          filename: `${addressBase.replace(/[^a-zA-Z0-9]/g, "_")}.${fileType}`,
          fileType,
          url,
          address: addressBase,
          fairMarketValue,
          createdAt: report.createdAt,
          approvalStatus: report.status === "approved" ? "approved" : "pending",
          release_status: (report as any).release_status,
          released_at: (report as any).released_at,
          downloadable: (report as any).downloadable !== false,
        }) as PdfReport;
      const isGenerating = isFileGenerationBlocking(report);
      const isDownloadable = (report as any).downloadable !== false;

      map.set(report._id, {
        key: report._id,
        address: addressBase,
        filename: `${addressBase}.docx`,
        fairMarketValue,
        createdAt: report.createdAt,
        approvalStatus: report.status === "approved" ? "approved" : "pending",
        release_status: (report as any).release_status,
        released_at: (report as any).released_at,
        downloadable: isDownloadable,
        isGeneratingFiles: isGenerating,
        generationState: (report as any).generation_state,
        workflowStage: (report as any).workflow_stage,
        workflowMessage: (report as any).workflow_message,
        workflowProgressPercent: (report as any).workflow_progress_percent,
        reportStatus: report.status,
        generationProgress: (report as any).generation_progress,
        jobError: (report as any).job_error,
        lotCount: 1,
        thumbnail: getFirstReportImage([], report),
        type: "RealEstate",
        variants: {
          pdf: previewFiles.pdf ? createPseudoReport(previewFiles.pdf, "pdf") : undefined,
          docx: previewFiles.docx
            ? createPseudoReport(previewFiles.docx, "docx")
            : undefined,
          xlsx: previewFiles.excel
            ? createPseudoReport(previewFiles.excel, "xlsx")
            : undefined,
          images: previewFiles.images
            ? createPseudoReport(previewFiles.images, "zip")
            : undefined,
        },
      });
    }

    for (const listing of lotListingReports) {
      const previewFiles =
        listing.status === "approved"
          ? {
              ...((listing as any).files || {}),
              ...((listing as any).preview_files || {}),
            }
          : {
              ...((listing as any).files || {}),
              ...((listing as any).preview_files || {}),
            };
      const currency = String(
        (listing as any)?.details?.currency ||
          (listing as any)?.preview_data?.currency ||
          "CAD"
      ).toUpperCase();
      const lots = Array.isArray((listing as any)?.preview_data?.lots)
        ? (listing as any).preview_data.lots
        : Array.isArray((listing as any)?.lots)
          ? (listing as any).lots
          : [];
      const total = lots.reduce((sum: number, lot: any) => {
        const parsed = Number(
          String(lot?.estimated_value || "").replace(/[^0-9.-]+/g, "")
        );
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0);
      const fairMarketValue =
        total > 0
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency,
              maximumFractionDigits: 0,
            }).format(total)
          : `${currency} 0.00`;
      const addressBase =
        (listing as any).details?.contract_no ||
        (listing as any).preview_data?.contract_no ||
        "Lot Listing";
      const createPseudoReport = (url: string, fileType: string, extra?: Partial<PdfReport>) =>
        ({
          _id: `${listing._id}-${fileType}`,
          filename: `${addressBase}.${fileType}`,
          fileType,
          url,
          ...extra,
          address: addressBase,
          fairMarketValue,
          createdAt: listing.createdAt,
          approvalStatus: listing.status === "approved" ? "approved" : "pending",
          release_status: (listing as any).release_status,
          released_at: (listing as any).released_at,
          downloadable: (listing as any).downloadable !== false,
        }) as PdfReport;
      const isGenerating = isFileGenerationBlocking(listing);
      const isDownloadable = (listing as any).downloadable !== false;

      map.set(listing._id, {
        key: listing._id,
        address: addressBase,
        filename: `${addressBase}.xlsx`,
        fairMarketValue,
        createdAt: listing.createdAt,
        contract_no:
          (listing as any).details?.contract_no ||
          (listing as any).preview_data?.contract_no,
        approvalStatus: listing.status === "approved" ? "approved" : "pending",
        release_status: (listing as any).release_status,
        released_at: (listing as any).released_at,
        downloadable: isDownloadable,
        isGeneratingFiles: isGenerating,
        generationState: (listing as any).generation_state,
        workflowStage: (listing as any).workflow_stage,
        workflowMessage: (listing as any).workflow_message,
        workflowProgressPercent: (listing as any).workflow_progress_percent,
        reportStatus: listing.status,
        generationProgress: (listing as any).generation_progress,
        jobError: (listing as any).job_error,
        lotSummary: summarizeLotNumbers(lots, listing._id),
        lotCount: lots.length,
        thumbnail: getFirstReportImage(lots, listing),
        type: "LotListing",
        variants: {
          specPdf: previewFiles.spec_pdf
            ? createPseudoReport(previewFiles.spec_pdf, "pdf", {
                _id: `${listing._id}-cr`,
                filename: `${addressBase}-CR.pdf`,
                fileType: "spec_pdf",
                crReportId: listing._id,
              })
            : undefined,
          crDocx: previewFiles.cr_docx
            ? createPseudoReport(previewFiles.cr_docx, "docx", {
                _id: `${listing._id}-cr-docx`,
                filename: `${addressBase}-CR.docx`,
                fileType: "cr_docx",
                crReportId: listing._id,
              })
            : isDownloadable ? createPseudoReport(`/api/reports/${listing._id}/cr-docx`, "docx", {
                _id: `${listing._id}-cr-docx`,
                filename: `${addressBase}-CR.docx`,
                fileType: "cr_docx",
                crReportId: listing._id,
              }) : undefined,
          xlsx: previewFiles.excel
            ? createPseudoReport(previewFiles.excel, "xlsx")
            : undefined,
          images: previewFiles.images
            ? createPseudoReport(previewFiles.images, "zip")
            : undefined,
        },
      });
    }

    for (const delivery of auctioneerDeliveries) {
      if (!delivery.reportId) continue;
      const group = map.get(String(delivery.reportId));
      if (group) group.auctioneerDelivery = delivery;
    }

    return Array.from(map.values());
  }, [
    assetReports,
    auctioneerDeliveries,
    lotListingReports,
    realEstateReports,
    reports,
  ]);

  const availableTypes = useMemo(() => {
    const values = new Set<string>();
    groups.forEach((group) => {
      if (group.type) values.add(String(group.type));
    });
    return Array.from(values);
  }, [groups]);

  const filteredGroups = useMemo(() => {
    let output = [...groups];
    const q = query.trim().toLowerCase();
    if (q) {
      output = output.filter((group) =>
        [
          group.address,
          group.filename,
          group.key,
          group.fairMarketValue,
          group.contract_no,
          new Date(group.createdAt).toLocaleDateString(),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }

    if (typeFilter) {
      output = output.filter((group) => String(group.type || "") === typeFilter);
    }

    const parseValue = (value: string) => {
      const parsed = Number(String(value || "").replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    output.sort((a, b) => {
      if (sortBy === "date-asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "date-desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      const aValue = parseValue(a.fairMarketValue);
      const bValue = parseValue(b.fairMarketValue);
      if (sortBy === "value-asc") {
        return (Number.isNaN(aValue) ? Infinity : aValue) - (Number.isNaN(bValue) ? Infinity : bValue);
      }
      return (Number.isNaN(bValue) ? -Infinity : bValue) - (Number.isNaN(aValue) ? -Infinity : aValue);
    });

    return output;
  }, [groups, query, sortBy, typeFilter]);

  const totalItems = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedGroups = filteredGroups.slice(startIndex, endIndex);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, sortBy, typeFilter]);

  async function handleDownload(reportId: string) {
    try {
      setDownloadingId(reportId);
      let reportWithUrl: PdfReport | undefined = reports.find((item) => item._id === reportId);
      if (!reportWithUrl) {
        for (const group of groups) {
          const found = Object.values(group.variants).find(
            (variant) => variant && variant._id === reportId
          );
          if (found) {
            reportWithUrl = found;
            break;
          }
        }
      }

      if ((reportWithUrl as any)?.downloadable === false) {
        throw new Error("This report is awaiting release. Downloads will be available after release.");
      }

      if (reportWithUrl?.crReportId) {
        const isCrDocx = reportWithUrl.fileType === "cr_docx";
        const { blob, filename } = isCrDocx
          ? await ReportsService.downloadCrDocx(reportWithUrl.crReportId)
          : await ReportsService.downloadCr(reportWithUrl.crReportId);
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download =
          filename ||
          reportWithUrl.filename ||
          `cr-${reportWithUrl.crReportId}.${isCrDocx ? "docx" : "pdf"}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
        toast.success(`Download started: ${anchor.download}`);
        return;
      }

      if (reportWithUrl && (reportWithUrl as any).url) {
        const fileUrl = (reportWithUrl as any).url as string;
        const anchor = document.createElement("a");
        anchor.href = fileUrl;
        anchor.download =
          reportWithUrl.filename || `report-${reportId}.${reportWithUrl.fileType}`;
        anchor.target = "_blank";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        toast.success(`Download started: ${anchor.download}`);
        return;
      }

      if (!reportWithUrl) throw new Error("Report not found");
      const { blob, filename } = await ReportsService.downloadReport(reportId);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        filename || reportWithUrl.filename || `report-${reportId}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      toast.success(`Download started: ${anchor.download}`);
    } catch (downloadError: any) {
      toast.error(
        downloadError?.response?.data?.message ||
          downloadError?.message ||
          "Download failed"
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("");
    setSortBy("date-desc");
    setPageSize(20);
    setPage(1);
  };

  const renderFileControls = (group: ReportGroup) => {
    const hasDownloads = hasGroupDownloadVariants(group);
    const workflowProgress = {
      ...(group.generationProgress || {}),
      ...(group.workflowMessage ? { message: group.workflowMessage } : {}),
      ...(Number.isFinite(group.workflowProgressPercent)
        ? { progressPercent: group.workflowProgressPercent }
        : {}),
    };
    const isPreparingPreview =
      group.workflowStage === "preparing_preview" ||
      (!group.workflowStage && group.reportStatus === "processing") ||
      (group.reportStatus === "preview" && Boolean(group.isGeneratingFiles));
    const isPreviewReady =
      group.workflowStage === "preview_ready" ||
      (!group.workflowStage &&
        group.reportStatus === "preview" &&
        !group.isGeneratingFiles);
    const showGeneratingOnly =
      group.workflowStage === "generating_files" ||
      (!group.workflowStage && Boolean(group.isGeneratingFiles) && !hasDownloads);
    const showErrorOnly =
      (group.workflowStage === "error" || group.generationState === "error") &&
      !hasDownloads &&
      !["processing", "preview", "declined"].includes(
        String(group.reportStatus || "")
      );
    const downloadable = group.downloadable !== false;

    if (isPreparingPreview) {
      return (
        <GeneratingFilesProgress
          progress={workflowProgress}
          fallbackMessage="Analyzing images and preparing your first preview..."
        />
      );
    }
    if (isPreviewReady && !hasDownloads) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--app-accent)]">
            Preview ready for review
          </span>
          <button
            type="button"
            className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]"
            onClick={() => router.push("/previews")}
          >
            Open preview
          </button>
        </div>
      );
    }
    if (showGeneratingOnly) {
      return <GeneratingFilesProgress progress={workflowProgress} />;
    }
    if (showErrorOnly) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--app-danger)]">
            {group.jobError || "File generation failed."}
          </span>
          <button
            type="button"
            className="rounded-md border border-[var(--app-danger-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]"
            onClick={() => void handleRetry(group)}
          >
            Retry
          </button>
        </div>
      );
    }
    if (group.workflowStage === "awaiting_approval") {
      return (
        <span className="text-xs font-semibold text-[var(--app-warning)]">
          Files ready; awaiting approval
        </span>
      );
    }
    if (group.workflowStage === "awaiting_release") {
      return (
        <span className="text-xs font-semibold text-[var(--app-warning)]">
          Approved; awaiting release
        </span>
      );
    }
    if (!downloadable) {
      return (
        <span className="text-xs font-semibold text-[var(--app-warning)]">
          Files available after release
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {(["pdf", "specPdf", "crDocx", "docx", "xlsx", "images"] as const).map(
          (variant) => {
            const file = group.variants[variant];
            if (!file) return null;
            const disabled =
              downloadingId === file._id ||
              !downloadable ||
              (!!file.approvalStatus && file.approvalStatus !== "approved");
            const label = actionLabel(variant);
            return (
              <button
                key={variant}
                type="button"
                title={`Download ${label}`}
                aria-label={`Download ${label}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 text-xs font-semibold text-[var(--app-text)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void handleDownload(file._id)}
                disabled={disabled}
              >
                {downloadingId === file._id ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  fileActionIcon(variant)
                )}
                <span>{label}</span>
              </button>
            );
          }
        )}
      </div>
    );
  };

  const renderReportActions = (group: ReportGroup) => {
    const delivery = group.auctioneerDelivery;
    const deliveryDisabled = Boolean(
      delivery &&
        (["not_ready", "queued", "sending", "sent"].includes(delivery.state) ||
          (delivery.state === "failed" && delivery.canSend === false))
    );
    const deliveryLabel =
      delivery?.state === "failed"
        ? "Retry delivery"
        : delivery?.state === "needs_reconciliation"
          ? "Resolve"
          : delivery?.state === "sent"
            ? "Sent"
            : delivery?.state === "queued" || delivery?.state === "sending"
              ? "Sending"
              : "Send";
    const deliveryTitle =
      delivery?.state === "not_ready"
        ? "Available after approval, release, and file generation"
        : delivery?.state === "sent"
          ? "This report has been sent to Auctioneer"
          : delivery?.state === "needs_reconciliation"
            ? "Resolve the uncertain Unknown Lot before retrying"
            : delivery?.state === "failed"
              ? delivery.canSend === false
                ? "Retry is available after approval, release, and file generation"
                : "Retry the failed Auctioneer delivery"
              : "Send approved data and final photos to Auctioneer";

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {delivery ? (
          <button
            type="button"
            title={deliveryTitle}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--app-border)] px-2.5 text-xs font-semibold text-[var(--app-text)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setDeliveryDialogItem(delivery)}
            disabled={deliveryDisabled}
          >
            <Send className="size-3.5" />
            {deliveryLabel}
          </button>
        ) : null}
        {String(group.type || "").toLowerCase() === "asset" ? (
          <button
            type="button"
            title="Merge with other Asset reports using the same contract"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--app-border)] px-2.5 text-xs font-semibold text-[var(--app-text)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]"
            onClick={() => setMergeAnchorId(group.key)}
          >
            <Merge className="size-3.5" />
            Merge
          </button>
        ) : null}
        <button
          type="button"
          title="Permanently delete this report"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--app-danger-border)] px-2.5 text-xs font-semibold text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void handleDelete(group)}
          disabled={deletingKey === group.key}
        >
          {deletingKey === group.key ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Delete
        </button>
      </div>
    );
  };

  const reportPresentation = (group: ReportGroup) => {
    const hasDownloads = hasGroupDownloadVariants(group);
    const status = statusTone(
      group.approvalStatus,
      Boolean(group.isGeneratingFiles) && !hasDownloads,
      group.release_status,
      group.generationState,
      group.reportStatus,
      group.workflowStage
    );
    const deliveryStatus = auctioneerDeliveryPresentation(
      group.auctioneerDelivery
    );
    const title = group.contract_no
      ? `${typeLabel(group.type)} · ${group.contract_no}`
      : group.address || typeLabel(group.type);
    return { status, deliveryStatus, title };
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-[42px] lg:py-[34px]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--app-text)] md:text-3xl">
              My reports
            </h1>
            <span className="rounded-md bg-[var(--app-panel-alt)] px-2 py-0.5 text-xs font-bold text-[var(--app-text-muted)]">
              {groups.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            Track report status and download every available deliverable.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3.5 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void handleManualRefresh()}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section
        aria-label="Report filters"
        className="grid gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.4fr)_minmax(140px,.7fr)_minmax(170px,.8fr)_120px_auto]"
      >
        <label className="relative block">
          <span className="sr-only">Search reports</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--app-text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reports..."
            className="min-h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] pl-9 pr-3 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)]"
          />
        </label>
        <label>
          <span className="sr-only">Report type</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          >
            <option value="">All types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort reports</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="min-h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="value-desc">Value high to low</option>
            <option value="value-asc">Value low to high</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="min-h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size} rows
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] px-3 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]"
          onClick={resetFilters}
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
      </section>

      {loading ? (
        <section
          className="grid min-h-80 place-items-center rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)]"
          role="status"
          aria-label="Loading reports"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
            <RefreshCw className="size-4 animate-spin text-[var(--app-accent)]" />
            Loading reports...
          </div>
        </section>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]"
        >
          {error}
        </div>
      ) : filteredGroups.length === 0 ? (
        <section className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-12 text-center">
          <FileText className="mx-auto size-6 text-[var(--app-text-muted)]" />
          <h2 className="mt-3 font-semibold text-[var(--app-text)]">
            No reports found
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
            {groups.length === 0
              ? "Create a report from the dashboard to populate this page."
              : "No reports match the current search and filters."}
          </p>
        </section>
      ) : (
        <>
          <ul className="space-y-3 xl:hidden">
            {paginatedGroups.map((group) => {
              const { status, deliveryStatus, title } =
                reportPresentation(group);
              return (
                <li
                  key={group.key}
                  className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "280px",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <ReportThumbnail
                        src={group.thumbnail}
                        title={title}
                        size="card"
                      />
                      <div className="min-w-0">
                      <h2 className="break-words font-semibold text-[var(--app-text)]">
                        {title}
                      </h2>
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        {typeLabel(group.type)} ·{" "}
                        {new Date(group.createdAt).toLocaleDateString()}
                      </p>
                      {group.lotSummary ? (
                        <p className="mt-1 break-words text-xs text-[var(--app-text-muted)]">
                          {group.lotSummary}
                        </p>
                      ) : null}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Lots", `${group.lotCount || "—"}`],
                      ["Market value", group.fairMarketValue || "—"],
                      [
                        "Client",
                        group.address && group.address !== group.contract_no
                          ? group.address
                          : "—",
                      ],
                      ["Delivery", deliveryStatus?.label || "—"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="min-w-0 rounded-lg bg-[var(--app-panel-alt)] p-2"
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                          {label}
                        </dt>
                        <dd className="mt-0.5 break-words text-sm font-medium text-[var(--app-text)]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 border-t border-[var(--app-border)] pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                      Files
                    </p>
                    {renderFileControls(group)}
                  </div>
                  <div className="mt-3 flex justify-end border-t border-[var(--app-border)] pt-3">
                    {renderReportActions(group)}
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="hidden overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] xl:block">
            <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
              <caption className="sr-only">Generated reports</caption>
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[25%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-[var(--app-panel-alt)] text-xs font-bold uppercase tracking-wide text-[var(--app-text-muted)]">
                <tr>
                  {[
                    "Report",
                    "Lots / FMV",
                    "Type",
                    "Created",
                    "Status",
                    "Files",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="border-b border-[var(--app-border)] px-3 py-3"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)]">
                {paginatedGroups.map((group) => {
                  const { status, deliveryStatus, title } =
                    reportPresentation(group);
                  return (
                    <tr
                      key={group.key}
                      className="align-top hover:bg-[var(--app-panel-alt)]"
                    >
                      <td className="px-3 py-4">
                        <div className="flex items-start gap-3">
                          <ReportThumbnail
                            src={group.thumbnail}
                            title={title}
                          />
                          <div className="min-w-0 pt-0.5">
                        <p className="break-words text-sm font-semibold text-[var(--app-text)]">
                          {title}
                        </p>
                        {group.lotSummary ? (
                          <p className="mt-1 break-words text-xs text-[var(--app-text-muted)]">
                            {group.lotSummary}
                          </p>
                        ) : null}
                        {group.isMergedReport ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--app-accent)]">
                            Merged · {group.mergedSourceCount || 2} sources
                          </p>
                        ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm font-semibold text-[var(--app-text)]">
                          {group.lotCount || "—"}{" "}
                          {group.lotCount === 1 ? "lot" : "lots"}
                        </p>
                        <p className="mt-1 break-words text-xs text-[var(--app-text-muted)]">
                          {group.fairMarketValue || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-4 text-sm text-[var(--app-text)]">
                        {typeLabel(group.type)}
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm text-[var(--app-text)]">
                          {new Date(group.createdAt).toLocaleDateString()}
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                          {new Date(group.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className="inline-flex rounded-md px-2 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor: status.bg,
                            color: status.color,
                          }}
                        >
                          {status.label}
                        </span>
                        {deliveryStatus ? (
                          <span
                            className="mt-1.5 block w-fit rounded-md px-2 py-1 text-xs font-semibold"
                            style={{
                              backgroundColor: deliveryStatus.bg,
                              color: deliveryStatus.color,
                            }}
                          >
                            {deliveryStatus.label}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {renderFileControls(group)}
                      </td>
                      <td className="px-3 py-3">
                        {renderReportActions(group)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <nav
            aria-label="Reports pagination"
            className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-[var(--app-text-muted)]">
              Showing {startIndex + 1}–{endIndex} of {totalItems} reports
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="min-h-9 rounded-lg border border-[var(--app-border)] px-3 font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span className="px-1 text-[var(--app-text-muted)]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="min-h-9 rounded-lg border border-[var(--app-border)] px-3 font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}

      {mergeAnchorId ? (
        <AssetMergeDialog
          open
          anchorReportId={mergeAnchorId}
          onClose={() => setMergeAnchorId(null)}
          onCreated={() => {
            setMergeAnchorId(null);
            window.dispatchEvent(new Event("cv:report-created"));
            router.push("/previews");
          }}
        />
      ) : null}
      {deliveryDialogItem ? (
        <AuctioneerDeliveryDialog
          open
          delivery={deliveryDialogItem}
          onClose={() => setDeliveryDialogItem(null)}
          onUpdated={(updated) => {
            setAuctioneerDeliveries((current) => {
              const existingIndex = current.findIndex(
                (item) => item.workItemId === updated.workItemId
              );
              if (existingIndex < 0) return [...current, updated];
              return current.map((item, index) =>
                index === existingIndex ? updated : item
              );
            });
          }}
        />
      ) : null}
    </main>
  );
}
