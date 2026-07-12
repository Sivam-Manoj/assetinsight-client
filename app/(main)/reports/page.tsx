"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CollectionsRounded,
  DeleteOutlineRounded,
  DescriptionRounded,
  InsertDriveFileRounded,
  MergeRounded,
  PictureAsPdfRounded,
  RefreshRounded,
  RestartAltRounded,
  SearchRounded,
  TableChartRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { ReportsService, type PdfReport } from "@/services/reports";
import { deleteAssetReport, getAssetReports, resubmitReport, type AssetReport } from "@/services/assets";
import { deleteLotListing, getLotListings, resubmitLotListing, type LotListing } from "@/services/lotListing";
import {
  RealEstateService,
  type RealEstateReport,
} from "@/services/realEstate";
import { EmptyState, SurfaceCard } from "@/components/common/WorkspaceUI";

const AssetMergeDialog = dynamic(
  () => import("@/components/reports/AssetMergeDialog"),
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
  generationProgress?: {
    progressPercent?: number;
    message?: string;
    currentLot?: number;
    totalLots?: number;
  };
  jobError?: string;
  lotSummary?: string;
  lotCount?: number;
  thumbnail?: string;
  type?: string;
  isMergedReport?: boolean;
  mergedSourceCount?: number;
  variants: {
    pdf?: PdfReport;
    specPdf?: PdfReport;
    crDocx?: PdfReport;
    docx?: PdfReport;
    xlsx?: PdfReport;
    images?: PdfReport;
  };
};

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
  if (report?.files_ready === true || report?.generation_state === "ready") return false;
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
  generationState?: string
) {
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

function actionButtonSx(kind: "download" | "delete"): Record<string, any> {
  if (kind === "delete") {
    return {
      minWidth: 52,
      minHeight: 54,
      px: 0.75,
      py: 0.65,
      borderRadius: 1.25,
      fontWeight: 700,
      fontSize: 10,
      lineHeight: 1.1,
      textTransform: "none",
      whiteSpace: "normal",
      borderColor: "rgba(220,38,38,0.28)",
      color: "#dc2626",
      bgcolor: "var(--app-panel-soft)",
      flexDirection: "column",
      gap: 0.35,
      "& .MuiButton-startIcon": { m: 0 },
      "&:hover": {
        borderColor: "#dc2626",
        bgcolor: "rgba(220,38,38,0.06)",
      },
    };
  }

  return {
    minWidth: 50,
    minHeight: 54,
    px: 0.65,
    py: 0.65,
    borderRadius: 1.25,
    fontWeight: 700,
    fontSize: 10,
    lineHeight: 1.1,
    textTransform: "none",
    whiteSpace: "normal",
    color: "var(--app-text)",
    border: "1px solid var(--app-border)",
    background: "var(--app-panel-soft)",
    boxShadow: "none",
    flexDirection: "column",
    gap: 0.35,
    "& .MuiButton-startIcon": { m: 0 },
    "&:hover": {
      borderColor: "var(--app-accent)",
      color: "var(--app-accent)",
      background: "var(--app-accent-soft)",
      boxShadow: "none",
    },
    "&.Mui-disabled": {
      color: "var(--app-text-muted)",
      background: "var(--app-panel-soft)",
      boxShadow: "none",
    },
  };
}

function fileActionIcon(
  variant: "pdf" | "specPdf" | "crDocx" | "docx" | "xlsx" | "images"
) {
  if (variant === "pdf") return <VisibilityRounded sx={{ fontSize: 18 }} />;
  if (variant === "specPdf") return <PictureAsPdfRounded sx={{ fontSize: 18 }} />;
  if (variant === "xlsx") return <TableChartRounded sx={{ fontSize: 18 }} />;
  if (variant === "images") return <CollectionsRounded sx={{ fontSize: 18 }} />;
  return <DescriptionRounded sx={{ fontSize: 18 }} />;
}

function getFirstReportImage(lots: any[], report: any): string | undefined {
  const globalImages = [
    ...(Array.isArray(report?.preview_data?.image_urls) ? report.preview_data.image_urls : []),
    ...(Array.isArray(report?.image_urls) ? report.image_urls : []),
  ].filter((value) => typeof value === "string" && value.trim());

  for (const lot of Array.isArray(lots) ? lots : []) {
    const direct = [
      lot?.image_url,
      ...(Array.isArray(lot?.image_urls) ? lot.image_urls : []),
      ...(Array.isArray(lot?.extra_image_urls) ? lot.extra_image_urls : []),
    ].find((value) => typeof value === "string" && value.trim());
    if (direct) return direct;

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

function GeneratingFilesProgress({ progress }: { progress?: ReportGroup["generationProgress"] }) {
  const percent = Math.max(2, Math.min(100, Number(progress?.progressPercent || 0)));
  return (
    <Box sx={{ minWidth: { xs: 180, sm: 220 } }}>
      <Stack spacing={0.75}>
        <Typography
          sx={{
            color: "#2563eb",
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {progress?.message || "Generating updated files..."}
        </Typography>
        <LinearProgress variant="determinate" value={percent} sx={{ height: 6, borderRadius: 1 }} />
        {progress?.totalLots ? (
          <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
            Lot {progress.currentLot || 0} of {progress.totalLots} · {Math.round(percent)}%
          </Typography>
        ) : null}
      </Stack>
    </Box>
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
  const [mergeAnchorId, setMergeAnchorId] = useState<string | null>(null);
  const loadingReportsRef = useRef(false);
  const hasActiveJobs = useMemo(
    () => [...assetReports, ...realEstateReports, ...lotListingReports].some(isFileGenerationActive),
    [assetReports, realEstateReports, lotListingReports]
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
      const [legacy, assetResponse, realEstateResponse, lotListingResponse] =
        await Promise.all([
          ReportsService.getMyReports(),
          getAssetReports().catch(() => ({ data: [] })),
          RealEstateService.getReports().catch(() => ({ data: [] })),
          getLotListings().catch(() => ({ data: [] })),
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
          lotCount: Number((report as any).lot_count || 0),
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

    return Array.from(map.values());
  }, [assetReports, lotListingReports, realEstateReports, reports]);

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
    const showGeneratingOnly = Boolean(group.isGeneratingFiles) && !hasDownloads;
    const showErrorOnly = group.generationState === "error" && !hasDownloads;
    const downloadable = group.downloadable !== false;

    if (showGeneratingOnly) {
      return <GeneratingFilesProgress progress={group.generationProgress} />;
    }

    if (showErrorOnly) {
      return (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ color: "#dc2626", fontSize: 12, fontWeight: 700 }}>
            {group.jobError || "File generation failed."}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => void handleRetry(group)}>
            Retry
          </Button>
        </Stack>
      );
    }

    if (!downloadable) {
      return (
        <Typography sx={{ color: "#b45309", fontSize: 12, fontWeight: 800 }}>
          Files available after release
        </Typography>
      );
    }

    return (
      <Stack direction="row" spacing={0.55} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
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
              <Tooltip key={variant} title={`Download ${label}`} arrow>
                <span>
                  <Button
                    size="small"
                    startIcon={fileActionIcon(variant)}
                    onClick={() => handleDownload(file._id)}
                    disabled={disabled}
                    sx={{
                      ...actionButtonSx("download"),
                      minWidth: variant === "crDocx" ? 62 : 50,
                    }}
                  >
                    {downloadingId === file._id ? "..." : label}
                  </Button>
                </span>
              </Tooltip>
            );
          }
        )}
      </Stack>
    );
  };

  const renderReportActions = (group: ReportGroup) => (
    <Stack direction="row" spacing={0.55} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
      {String(group.type || "").toLowerCase() === "asset" ? (
        <Tooltip title="Merge this report with other Asset reports using the same contract" arrow>
          <Button
            size="small"
            variant="outlined"
            startIcon={<MergeRounded sx={{ fontSize: 18 }} />}
            onClick={() => setMergeAnchorId(group.key)}
            sx={{ ...actionButtonSx("download"), minWidth: 72 }}
          >
            Merge
          </Button>
        </Tooltip>
      ) : null}
      <Tooltip title="Permanently delete this report" arrow>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DeleteOutlineRounded sx={{ fontSize: 18 }} />}
            onClick={() => handleDelete(group)}
            disabled={deletingKey === group.key}
            sx={actionButtonSx("delete")}
          >
            {deletingKey === group.key ? "..." : "Delete"}
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );

  return (
    <Stack
      spacing={2.25}
      sx={{ minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="h3" sx={{ color: "var(--app-text)", fontWeight: 800 }}>
              My Reports
            </Typography>
            <Chip
              size="small"
              label={groups.length}
              sx={{ borderRadius: 1.25, fontWeight: 800, bgcolor: "var(--app-panel-soft)" }}
            />
          </Stack>
          <Typography sx={{ mt: 0.65, color: "var(--app-text-muted)" }}>
            Review report status and download each available file directly.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={refreshing ? <CircularProgress color="inherit" size={16} /> : <RefreshRounded />}
          onClick={() => void handleManualRefresh()}
          disabled={loading || refreshing}
          sx={{ borderRadius: 1.5, whiteSpace: "nowrap" }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </Stack>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          border: "1px solid var(--app-border)",
          borderRadius: 2,
          bgcolor: "var(--app-panel-soft)",
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 1.25,
            alignItems: "center",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "minmax(260px, 1.5fr) minmax(145px, .65fr) minmax(175px, .8fr) minmax(125px, .55fr) auto",
            },
          }}
        >
          <TextField
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reports..."
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded sx={{ color: "var(--app-text-muted)" }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Select
            size="small"
            value={typeFilter}
            displayEmpty
            onChange={(event) => setTypeFilter(String(event.target.value))}
          >
            <MenuItem value="">All types</MenuItem>
            {availableTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {typeLabel(type)}
              </MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          >
            <MenuItem value="date-desc">Newest first</MenuItem>
            <MenuItem value="date-asc">Oldest first</MenuItem>
            <MenuItem value="value-desc">Value high to low</MenuItem>
            <MenuItem value="value-asc">Value low to high</MenuItem>
          </Select>
          <Select
            size="small"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <MenuItem key={size} value={size}>
                {size} rows
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<RestartAltRounded />}
            onClick={resetFilters}
            sx={{ borderRadius: 1.5, whiteSpace: "nowrap" }}
          >
            Reset
          </Button>
        </Box>
      </Paper>

      {loading ? (
        <Paper
          elevation={0}
          sx={{ minHeight: 320, display: "grid", placeItems: "center", border: "1px solid var(--app-border)", borderRadius: 2 }}
        >
          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <CircularProgress />
            <Typography sx={{ color: "var(--app-text-muted)" }}>Loading reports...</Typography>
          </Stack>
        </Paper>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          title="No reports found"
          description={
            groups.length === 0
              ? "Create a report from the dashboard to populate this page."
              : "No reports match the current search and filters."
          }
        />
      ) : (
        <>
          <Stack
            spacing={1.25}
            sx={{ display: "flex", "@media (min-width: 1280px)": { display: "none" } }}
          >
            {paginatedGroups.map((group) => {
              const hasDownloads = hasGroupDownloadVariants(group);
              const status = statusTone(
                group.approvalStatus,
                Boolean(group.isGeneratingFiles) && !hasDownloads,
                group.release_status,
                group.generationState
              );
              const title = group.contract_no
                ? `${typeLabel(group.type)} - ${group.contract_no}`
                : group.address || typeLabel(group.type);
              return (
                <SurfaceCard key={group.key} sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: 2, overflow: "hidden" }}>
                  <Stack spacing={1.6}>
                    <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: "flex-start" }}>
                      <Box
                        sx={{
                          width: 68,
                          height: 68,
                          flex: "0 0 68px",
                          border: "1px solid var(--app-border)",
                          borderRadius: 1.25,
                          overflow: "hidden",
                          bgcolor: "rgba(148,163,184,.08)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {group.thumbnail ? (
                          <Box component="img" src={group.thumbnail} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <InsertDriveFileRounded sx={{ color: "var(--app-text-muted)" }} />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ color: "var(--app-text)", fontWeight: 800, overflowWrap: "anywhere" }}>
                          {title}
                        </Typography>
                        {group.contract_no ? (
                          <Typography variant="body2" sx={{ mt: 0.25, color: "var(--app-text-muted)" }}>
                            Contract: {group.contract_no}
                          </Typography>
                        ) : null}
                        {group.lotSummary ? (
                          <Typography variant="body2" sx={{ mt: 0.25, color: "var(--app-text-muted)", overflowWrap: "anywhere" }}>
                            {group.lotSummary}
                          </Typography>
                        ) : null}
                        {group.isMergedReport ? (
                          <Typography sx={{ color: "#2563eb", mt: 0.35, fontSize: 12, fontWeight: 800 }}>
                            Merged from {group.mergedSourceCount || 2} reports
                          </Typography>
                        ) : null}
                      </Box>
                      <Chip
                        size="small"
                        label={status.label}
                        sx={{ borderRadius: 1.25, bgcolor: status.bg, color: status.color, fontWeight: 800, flexShrink: 0 }}
                      />
                    </Stack>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1 }}>
                      {[
                        ["Lots / FMV", `${group.lotCount || "-"} lot${group.lotCount === 1 ? "" : "s"} · ${group.fairMarketValue || "-"}`],
                        ["Type", typeLabel(group.type)],
                        ["Created", new Date(group.createdAt).toLocaleDateString()],
                        ["Client", group.address && group.address !== group.contract_no ? group.address : "-"],
                      ].map(([label, value]) => (
                        <Box key={label} sx={{ p: 1, bgcolor: "rgba(148,163,184,.06)", borderRadius: 1.25, minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}>{label}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--app-text)", fontWeight: 700, overflowWrap: "anywhere" }}>{value}</Typography>
                        </Box>
                      ))}
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ display: "block", mb: 0.75, color: "var(--app-text-muted)", fontWeight: 800 }}>
                        Files
                      </Typography>
                      {renderFileControls(group)}
                    </Box>
                    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>{renderReportActions(group)}</Stack>
                  </Stack>
                </SurfaceCard>
              );
            })}
          </Stack>

          <SurfaceCard
            sx={{
              p: 0,
              display: "none",
              borderRadius: 2,
              overflow: "hidden",
              "@media (min-width: 1280px)": { display: "block" },
            }}
          >
            <Box component="table" sx={{ width: "100%", maxWidth: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <Box component="colgroup">
                {["21%", "9%", "8%", "10%", "9%", "29%", "14%"].map((width, index) => (
                  <Box component="col" key={index} sx={{ width }} />
                ))}
              </Box>
              <Box component="thead">
                <Box component="tr" sx={{ bgcolor: "rgba(148,163,184,.06)" }}>
                  {["Report", "Lots / FMV", "Type", "Created", "Status", "Files", "Actions"].map((heading) => (
                    <Box component="th" key={heading} sx={{ px: 1.25, py: 1.4, textAlign: "left", color: "var(--app-text)", fontSize: 12, fontWeight: 800, borderBottom: "1px solid var(--app-border)" }}>
                      {heading}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {paginatedGroups.map((group) => {
                  const hasDownloads = hasGroupDownloadVariants(group);
                  const status = statusTone(
                    group.approvalStatus,
                    Boolean(group.isGeneratingFiles) && !hasDownloads,
                    group.release_status,
                    group.generationState
                  );
                  const title = group.contract_no
                    ? `${typeLabel(group.type)} - ${group.contract_no}`
                    : group.address || typeLabel(group.type);
                  return (
                    <Box component="tr" key={group.key} sx={{ "&:not(:last-child) td": { borderBottom: "1px solid var(--app-border)" }, "&:hover": { bgcolor: "rgba(148,163,184,.035)" } }}>
                      <Box component="td" sx={{ px: 1.25, py: 1.25, verticalAlign: "top" }}>
                        <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "flex-start" }}>
                          <Box sx={{ width: 58, height: 58, flex: "0 0 58px", border: "1px solid var(--app-border)", borderRadius: 1, overflow: "hidden", bgcolor: "rgba(148,163,184,.08)", display: "grid", placeItems: "center" }}>
                            {group.thumbnail ? (
                              <Box component="img" src={group.thumbnail} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <InsertDriveFileRounded sx={{ color: "var(--app-text-muted)" }} />
                            )}
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ color: "var(--app-text)", fontWeight: 800, overflowWrap: "anywhere" }}>{title}</Typography>
                            {group.contract_no ? <Typography variant="caption" sx={{ display: "block", color: "var(--app-text-muted)" }}>Contract: {group.contract_no}</Typography> : null}
                            {group.lotSummary ? <Typography variant="caption" sx={{ display: "block", color: "var(--app-text-muted)", overflowWrap: "anywhere" }}>{group.lotSummary}</Typography> : null}
                            {group.isMergedReport ? <Typography variant="caption" sx={{ display: "block", color: "#2563eb", fontWeight: 800 }}>Merged · {group.mergedSourceCount || 2} sources</Typography> : null}
                          </Box>
                        </Stack>
                      </Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.25, verticalAlign: "top" }}>
                        <Typography variant="body2" sx={{ color: "var(--app-text)", fontWeight: 700 }}>{group.lotCount || "-"} lot{group.lotCount === 1 ? "" : "s"}</Typography>
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)", overflowWrap: "anywhere" }}>{group.fairMarketValue || "-"}</Typography>
                      </Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.25, verticalAlign: "top" }}>
                        <Chip size="small" variant="outlined" label={typeLabel(group.type)} sx={{ borderRadius: 1, maxWidth: "100%" }} />
                      </Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.25, verticalAlign: "top" }}>
                        <Typography variant="body2" sx={{ color: "var(--app-text)", fontWeight: 700 }}>{new Date(group.createdAt).toLocaleDateString()}</Typography>
                        <Typography variant="caption" sx={{ display: "block", color: "var(--app-text-muted)" }}>{new Date(group.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Typography>
                      </Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.25, verticalAlign: "top" }}>
                        <Chip size="small" label={status.label} sx={{ borderRadius: 1, bgcolor: status.bg, color: status.color, fontWeight: 800, maxWidth: "100%" }} />
                        {group.released_at ? <Typography variant="caption" sx={{ display: "block", mt: 0.45, color: "var(--app-text-muted)" }}>{new Date(group.released_at).toLocaleDateString()}</Typography> : null}
                      </Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.1, verticalAlign: "top" }}>{renderFileControls(group)}</Box>
                      <Box component="td" sx={{ px: 1.25, py: 1.1, verticalAlign: "top" }}>{renderReportActions(group)}</Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </SurfaceCard>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
              Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems} reports
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: { xs: "space-between", sm: "flex-end" } }}>
              <Button size="small" variant="outlined" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} sx={{ borderRadius: 1.25 }}>Previous</Button>
              <Typography variant="body2" sx={{ px: 1, color: "var(--app-text-muted)", whiteSpace: "nowrap" }}>Page {currentPage} of {totalPages}</Typography>
              <Button size="small" variant="outlined" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} sx={{ borderRadius: 1.25 }}>Next</Button>
            </Stack>
          </Stack>
        </>
      )}

      <AssetMergeDialog
        open={Boolean(mergeAnchorId)}
        anchorReportId={mergeAnchorId}
        onClose={() => setMergeAnchorId(null)}
        onCreated={() => {
          setMergeAnchorId(null);
          window.dispatchEvent(new Event("cv:report-created"));
          router.push("/previews");
        }}
      />
    </Stack>
  );
}
