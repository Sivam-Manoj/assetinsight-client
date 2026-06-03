"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  DownloadRounded,
  SearchRounded,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { ReportsService, type PdfReport } from "@/services/reports";
import { deleteAssetReport, getAssetReports, type AssetReport } from "@/services/assets";
import { deleteLotListing, getLotListings, type LotListing } from "@/services/lotListing";
import {
  RealEstateService,
  type RealEstateReport,
} from "@/services/realEstate";
import { EmptyState, PageHeader, SectionPanel, SurfaceCard } from "@/components/common/WorkspaceUI";

type ReportGroup = {
  key: string;
  address: string;
  filename?: string;
  fairMarketValue: string;
  createdAt: string;
  contract_no?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  type?: string;
  variants: {
    pdf?: PdfReport;
    specPdf?: PdfReport;
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

function statusTone(status?: string) {
  if (status === "approved") {
    return { bg: "rgba(5,150,105,0.12)", color: "#059669", label: "Approved" };
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

function actionLabel(variant: "pdf" | "specPdf" | "docx" | "xlsx" | "images") {
  if (variant === "pdf") return "Data";
  if (variant === "specPdf") return "CR";
  if (variant === "docx") return "DOCX";
  if (variant === "xlsx") return "Excel";
  return "Images";
}

function actionButtonSx(kind: "download" | "delete") {
  if (kind === "delete") {
    return {
      minWidth: 0,
      px: 1.8,
      py: 0.95,
      borderRadius: 999,
      fontWeight: 800,
      fontSize: 13,
      lineHeight: 1,
      textTransform: "none",
      whiteSpace: "nowrap",
      flexShrink: 0,
      borderColor: "rgba(244, 63, 94, 0.4)",
      color: "#fb7185",
      bgcolor: "transparent",
      "&:hover": {
        borderColor: "#fb7185",
        bgcolor: "rgba(244, 63, 94, 0.08)",
      },
    };
  }

  return {
    minWidth: 0,
    px: 1.8,
    py: 0.95,
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1,
    textTransform: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
    color: "#ecf6ff",
    border: "none",
    background:
      "linear-gradient(135deg, #1d5fe2 0%, #0f4ccf 100%)",
    boxShadow: "0 10px 24px rgba(15, 76, 207, 0.24)",
    "&:hover": {
      background:
        "linear-gradient(135deg, #2a69eb 0%, #1556da 100%)",
      boxShadow: "0 12px 28px rgba(15, 76, 207, 0.3)",
    },
    "&.Mui-disabled": {
      color: "rgba(236, 246, 255, 0.68)",
      background:
        "linear-gradient(135deg, rgba(29,95,226,0.38) 0%, rgba(15,76,207,0.38) 100%)",
      boxShadow: "none",
    },
  };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<PdfReport[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
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
            report.status === "approved" || report.status === "pending_approval"
        )
      );
      setRealEstateReports(
        realEstateResponse.data.filter(
          (report) =>
            report.status === "approved" || report.status === "pending_approval"
        )
      );
      setLotListingReports(
        lotListingResponse.data.filter(
          (report) =>
            report.status === "approved" ||
            report.status === "pending_approval" ||
            (report.status === "processing" &&
              (Boolean((report as any).files_generating) ||
                Boolean((report as any).files_regenerating)))
        )
      );
    } catch (loadError: any) {
      setError(
        loadError?.response?.data?.message ||
          loadError?.message ||
          "Failed to load reports"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();

    const handler = () => void loadReports();
    window.addEventListener("cv:report-created", handler as any);
    return () => window.removeEventListener("cv:report-created", handler as any);
  }, []);

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

  const groups = useMemo<ReportGroup[]>(() => {
    const map = new Map<string, ReportGroup>();
    const assetReportIds = new Set(assetReports.map((report) => report._id));
    const realEstateReportIds = new Set(
      realEstateReports.map((report) => report._id)
    );

    for (const report of reports) {
      const reportRef = (report as any).report as string | undefined;
      if (
        reportRef &&
        (assetReportIds.has(reportRef) || realEstateReportIds.has(reportRef))
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

      const createPseudoReport = (url: string, fileType: string) =>
        ({
          _id: `${asset._id}-${fileType}`,
          filename: `${addressBase}.${fileType}`,
          fileType,
          url,
          address: addressBase,
          fairMarketValue,
          createdAt: asset.createdAt,
          approvalStatus: asset.status === "approved" ? "approved" : "pending",
        }) as PdfReport;

      map.set(asset._id, {
        key: asset._id,
        address: addressBase,
        filename: `${addressBase}.docx`,
        fairMarketValue,
        createdAt: asset.createdAt,
        contract_no:
          (asset as any).contract_no || (asset as any).preview_data?.contract_no,
        approvalStatus: asset.status === "approved" ? "approved" : "pending",
        type: "Asset",
        variants: {
          pdf: previewFiles.pdf ? createPseudoReport(previewFiles.pdf, "pdf") : undefined,
          specPdf: previewFiles.spec_pdf
            ? createPseudoReport(previewFiles.spec_pdf, "pdf")
            : undefined,
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
        }) as PdfReport;

      map.set(report._id, {
        key: report._id,
        address: addressBase,
        filename: `${addressBase}.docx`,
        fairMarketValue,
        createdAt: report.createdAt,
        approvalStatus: report.status === "approved" ? "approved" : "pending",
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
          ? (listing as any).files || (listing as any).preview_files || {}
          : (listing as any).preview_files || (listing as any).files || {};
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
      const createPseudoReport = (url: string, fileType: string) =>
        ({
          _id: `${listing._id}-${fileType}`,
          filename: `${addressBase}.${fileType}`,
          fileType,
          url,
          address: addressBase,
          fairMarketValue,
          createdAt: listing.createdAt,
          approvalStatus: listing.status === "approved" ? "approved" : "pending",
        }) as PdfReport;

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
        type: "LotListing",
        variants: {
          specPdf: previewFiles.spec_pdf
            ? createPseudoReport(previewFiles.spec_pdf, "pdf")
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

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Records"
        title="My Reports"
        description="Search, filter, and download generated report packages across asset, real estate, salvage, and lot listing workflows."
      />

      <SectionPanel
        title="Report library"
        subtitle="All approved and pending report packages in one searchable workspace."
      >
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1.5fr repeat(3, minmax(0, 0.7fr))",
              },
            }}
          >
            <TextField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by report, contract, value, or date"
            />
            <Select
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
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as any)}
            >
              <MenuItem value="date-desc">Newest first</MenuItem>
              <MenuItem value="date-asc">Oldest first</MenuItem>
              <MenuItem value="value-desc">Value high to low</MenuItem>
              <MenuItem value="value-asc">Value low to high</MenuItem>
            </Select>
            <Select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {[10, 20, 50].map((size) => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </Select>
          </Box>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ justifyContent: "space-between" }}
          >
            <Typography sx={{ color: "var(--app-text-muted)" }}>
              Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems}
            </Typography>
            <Typography sx={{ color: "var(--app-text-muted)" }}>
              Includes grouped variant downloads where available.
            </Typography>
          </Stack>

          {loading ? (
            <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}>
              <Stack spacing={2} sx={{ alignItems: "center" }}>
                <CircularProgress />
                <Typography sx={{ color: "var(--app-text-muted)" }}>
                  Loading reports...
                </Typography>
              </Stack>
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              title="No reports found"
              description={
                groups.length === 0
                  ? "Create a report from the dashboard to populate this library."
                  : "No reports match the current search and filters."
              }
            />
          ) : (
            <>
              <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
                {paginatedGroups.map((group) => {
                  const status = statusTone(group.approvalStatus);
                  const title = group.contract_no
                    ? `${typeLabel(group.type)} · ${group.contract_no}`
                    : group.address || typeLabel(group.type);
                  return (
                    <SurfaceCard key={group.key} sx={{ p: 2.25 }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between" }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              sx={{
                                color: "var(--app-text)",
                                fontWeight: 800,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {title}
                            </Typography>
                            <Typography sx={{ color: "var(--app-text-muted)", mt: 0.5 }}>
                              {new Date(group.createdAt).toLocaleDateString()} · {group.fairMarketValue || "—"}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              px: 1.25,
                              py: 0.5,
                              borderRadius: 99,
                              bgcolor: status.bg,
                              color: status.color,
                              fontWeight: 700,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {status.label}
                          </Box>
                        </Stack>
                        <Typography sx={{ color: "var(--app-text-muted)" }}>
                          {group.address || "No address provided"}
                        </Typography>
                        <Stack direction="row" spacing={0.8} sx={{ flexWrap: "nowrap", overflowX: "auto", pb: 0.5 }}>
                          {(["pdf", "specPdf", "docx", "xlsx", "images"] as const).map((variant) => {
                            const file = group.variants[variant];
                            if (!file) return null;
                            const disabled =
                              downloadingId === file._id ||
                              (!!file.approvalStatus && file.approvalStatus !== "approved");
                            return (
                              <Button
                                key={variant}
                                size="small"
                                onClick={() => handleDownload(file._id)}
                                disabled={disabled}
                                sx={actionButtonSx("download")}
                              >
                                {actionLabel(variant)}
                              </Button>
                            );
                          })}
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleDelete(group)}
                            disabled={deletingKey === group.key}
                            sx={actionButtonSx("delete")}
                          >
                            {deletingKey === group.key ? "Deleting..." : "Delete"}
                          </Button>
                        </Stack>
                      </Stack>
                    </SurfaceCard>
                  );
                })}
              </Stack>

              <SurfaceCard sx={{ p: 0, display: { xs: "none", md: "block" }, overflow: "hidden" }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        {["Report", "Date", "Value", "Status", "Actions"].map((heading) => (
                          <Box
                            key={heading}
                            component="th"
                            sx={{
                              textAlign: heading === "Actions" ? "right" : "left",
                              px: 2.5,
                              py: 1.75,
                              color: "var(--app-text-muted)",
                              fontSize: 12,
                              fontWeight: 800,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              borderBottom: "1px solid var(--app-border)",
                            }}
                          >
                            {heading}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {paginatedGroups.map((group) => {
                        const status = statusTone(group.approvalStatus);
                        const title = group.contract_no
                          ? `${typeLabel(group.type)} · ${group.contract_no}`
                          : group.address || typeLabel(group.type);
                        return (
                          <Box
                            key={group.key}
                            component="tr"
                            sx={{
                              "&:not(:last-child) td": {
                                borderBottom: "1px solid var(--app-border)",
                              },
                            }}
                          >
                            <Box component="td" sx={{ px: 2.5, py: 2 }}>
                              <Typography sx={{ color: "var(--app-text)", fontWeight: 800 }}>
                                {title}
                              </Typography>
                              <Typography sx={{ color: "var(--app-text-muted)", mt: 0.4 }}>
                                {group.address || "No address provided"}
                              </Typography>
                            </Box>
                            <Box component="td" sx={{ px: 2.5, py: 2, color: "var(--app-text)" }}>
                              {new Date(group.createdAt).toLocaleDateString()}
                            </Box>
                            <Box component="td" sx={{ px: 2.5, py: 2, color: "var(--app-text)" }}>
                              {group.fairMarketValue || "—"}
                            </Box>
                            <Box component="td" sx={{ px: 2.5, py: 2 }}>
                              <Box
                                sx={{
                                  display: "inline-flex",
                                  px: 1.25,
                                  py: 0.5,
                                  borderRadius: 99,
                                  bgcolor: status.bg,
                                  color: status.color,
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}
                              >
                                {status.label}
                              </Box>
                            </Box>
                            <Box component="td" sx={{ px: 2.5, py: 2 }}>
                              <Stack
                                direction="row"
                                spacing={0.8}
                                sx={{
                                  justifyContent: "flex-end",
                                  flexWrap: "nowrap",
                                  overflowX: "auto",
                                  pb: 0.5,
                                }}
                              >
                                {(["pdf", "specPdf", "docx", "xlsx", "images"] as const).map((variant) => {
                                  const file = group.variants[variant];
                                  if (!file) return null;
                                  const disabled =
                                    downloadingId === file._id ||
                                    (!!file.approvalStatus &&
                                      file.approvalStatus !== "approved");
                                  return (
                                    <Button
                                      key={variant}
                                      size="small"
                                      onClick={() => handleDownload(file._id)}
                                      disabled={disabled}
                                      sx={actionButtonSx("download")}
                                    >
                                      {actionLabel(variant)}
                                    </Button>
                                  );
                                })}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleDelete(group)}
                                  disabled={deletingKey === group.key}
                                  sx={actionButtonSx("delete")}
                                >
                                  {deletingKey === group.key ? "Deleting..." : "Delete"}
                                </Button>
                              </Stack>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
              </SurfaceCard>

              <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                <Button
                  variant="outlined"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <Button variant="text" disabled>
                  Page {currentPage} / {totalPages}
                </Button>
                <Button
                  variant="outlined"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </SectionPanel>
    </Stack>
  );
}
