"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  AutoAwesomeRounded,
  DeleteOutlineRounded,
  EditRounded,
  RefreshRounded,
  SendRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import {
  deleteAssetReport,
  getAssetReports,
  getSubmittedReports,
  resubmitReport,
  type AssetReport,
} from "@/services/assets";
import {
  deleteLotListing,
  getLotListings,
  getSubmittedLotListings,
  resubmitLotListing,
  type LotListing,
} from "@/services/lotListing";
import {
  RealEstateService,
  type RealEstateReport,
} from "@/services/realEstate";
import {
  EmptyState,
  PageHeader,
  SectionPanel,
  StatusPill,
  SurfaceCard,
} from "@/components/common/WorkspaceUI";
import StatusBadge from "@/components/reports/StatusBadge";
import PreviewModal from "@/components/reports/PreviewModal";
import RealEstatePreviewModal from "@/components/reports/RealEstatePreviewModal";
import LotListingPreviewModal from "@/components/reports/LotListingPreviewModal";

type CombinedReport =
  | (AssetReport & { reportType: "asset" })
  | (RealEstateReport & { reportType: "realEstate" })
  | (LotListing & { reportType: "lotListing" });

type TabType = "new" | "submitted";

function requestReportsRefetch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cv:report-created"));
}

function summaryForReport(report: CombinedReport) {
  if (report.reportType === "realEstate") {
    return {
      title:
        (report as any).property_details?.address ||
        (report as any).preview_data?.property_details?.address ||
        "Real Estate Report",
      typeLabel: "Real Estate",
      accent: "#059669",
      fields: [
        ["Property Type", (report as any).property_type || "—"],
        [
          "Market Value",
          (report as any).preview_data?.valuation?.fair_market_value ||
            (report as any).valuation?.fair_market_value ||
            "—",
        ],
        ["Images", String(report.imageUrls?.length || 0)],
      ],
    };
  }
  if (report.reportType === "lotListing") {
    return {
      title:
        (report as any).details?.contract_no ||
        (report as any).preview_data?.contract_no ||
        "Lot Listing",
      typeLabel: "Lot Listing",
      accent: "#7c3aed",
      fields: [
        ["Lots", String((report as any).lots?.length || 0)],
        [
          "Currency",
          (report as any).preview_data?.currency ||
            (report as any).details?.currency ||
            "CAD",
        ],
        ["Images", String(report.imageUrls?.length || 0)],
      ],
    };
  }
  return {
    title: (report as any).client_name || "Asset Report",
    typeLabel: "Asset",
    accent: "#2563eb",
    fields: [
      ["Total Assets", String((report as any).lots?.length || 0)],
      ["Grouping", (report as any).grouping_mode?.replace(/_/g, " ") || "—"],
      ["Industry", report.preview_data?.industry || "Not specified"],
    ],
  };
}

export default function PreviewsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("new");
  const [newReports, setNewReports] = useState<CombinedReport[]>([]);
  const [submittedReports, setSubmittedReports] = useState<CombinedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resubmitting, setResubmitting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [realEstateModalOpen, setRealEstateModalOpen] = useState(false);
  const [lotListingModalOpen, setLotListingModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isResubmitMode, setIsResubmitMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CombinedReport | null>(null);
  const loadingReportsRef = useRef(false);

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
        assetResponse,
        realEstateResponse,
        submittedAssetResponse,
        lotListingResponse,
        submittedLotListingResponse,
      ] = await Promise.all([
        getAssetReports().catch(() => ({ data: [] })),
        RealEstateService.getReports().catch(() => ({ data: [] })),
        getSubmittedReports().catch(() => ({ data: [] })),
        getLotListings().catch(() => ({ data: [] })),
        getSubmittedLotListings().catch(() => ({ data: [] })),
      ]);

      const assetPreviews: CombinedReport[] = (assetResponse.data || [])
        .filter((report) => {
          const generating =
            Boolean((report as any).files_generating) ||
            Boolean((report as any).files_regenerating);
          return (
            (report.status === "processing" ||
              report.status === "error" ||
              report.status === "preview" ||
              report.status === "declined") &&
            !generating
          );
        })
        .map((report) => ({ ...report, reportType: "asset" as const }));

      const realEstatePreviews: CombinedReport[] = (realEstateResponse.data || [])
        .filter(
          (report) => report.status === "preview" || report.status === "declined"
        )
        .map((report) => ({ ...report, reportType: "realEstate" as const }));

      const lotListingPreviews: CombinedReport[] = (lotListingResponse.data || [])
        .filter((report) => {
          const generating =
            Boolean((report as any).files_generating) ||
            Boolean((report as any).files_regenerating);
          return (
            ((report.status === "processing" && !generating) ||
              report.status === "error" ||
              report.status === "preview" ||
              report.status === "declined")
          );
        })
        .map((report) => ({ ...report, reportType: "lotListing" as const }));

      const submittedAssets: CombinedReport[] = (submittedAssetResponse.data || []).map(
        (report) => ({ ...report, reportType: "asset" as const })
      );
      const realEstateSubmitted: CombinedReport[] = (realEstateResponse.data || [])
        .filter(
          (report) =>
            report.status === "pending_approval" || report.status === "approved"
        )
        .map((report) => ({ ...report, reportType: "realEstate" as const }));
      const lotListingSubmitted: CombinedReport[] = (
        submittedLotListingResponse.data || []
      ).map((report) => ({ ...report, reportType: "lotListing" as const }));

      setNewReports(
        [...assetPreviews, ...realEstatePreviews, ...lotListingPreviews].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setSubmittedReports(
        [...submittedAssets, ...realEstateSubmitted, ...lotListingSubmitted].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      if (options.successToast) {
        toast.success("Previews refreshed.");
      }
      return true;
    } catch (error: any) {
      if (!options.silent) {
        toast.error(error.response?.data?.message || "Failed to load previews");
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
  }, [loadReports]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadReports({ silent: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [loadReports]);

  const handleManualRefresh = async () => {
    await loadReports({ successToast: true });
  };

  const handleOpenPreview = (report: CombinedReport, resubmitMode = false) => {
    setSelectedReportId(report._id);
    setIsResubmitMode(resubmitMode);
    if (report.reportType === "realEstate") {
      setRealEstateModalOpen(true);
    } else if (report.reportType === "lotListing") {
      setLotListingModalOpen(true);
    } else {
      setPreviewModalOpen(true);
    }
  };

  const handleModalClose = () => {
    setPreviewModalOpen(false);
    setRealEstateModalOpen(false);
    setLotListingModalOpen(false);
    setSelectedReportId(null);
    setIsResubmitMode(false);
  };

  const handleSuccess = () => {
    requestReportsRefetch();
    void loadReports();
    toast.success("Report submitted successfully.");
  };

  const handleQuickResubmit = async (report: CombinedReport) => {
    try {
      setResubmitting(report._id);
      if (report.reportType === "lotListing") {
        await resubmitLotListing(report._id);
      } else {
        await resubmitReport(report._id);
      }
      requestReportsRefetch();
      toast.success("Report resubmitted. Files are being regenerated.");
      await loadReports();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to resubmit report");
    } finally {
      setResubmitting(null);
    }
  };

  const handleDeleteReport = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(deleteTarget._id);
      if (deleteTarget.reportType === "asset") {
        await deleteAssetReport(deleteTarget._id);
      } else if (deleteTarget.reportType === "lotListing") {
        await deleteLotListing(deleteTarget._id);
      } else {
        await RealEstateService.deleteReport(deleteTarget._id);
      }
      toast.success("Report deleted successfully");
      setDeleteTarget(null);
      await loadReports();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete report");
    } finally {
      setDeleting(null);
    }
  };

  const reports = activeTab === "new" ? newReports : submittedReports;

  const summary = useMemo(() => {
    const all = [...newReports, ...submittedReports];
    return {
      newCount: newReports.length,
      pendingCount: all.filter((report) => report.status === "pending_approval")
        .length,
      approvedCount: all.filter((report) => report.status === "approved").length,
      declinedCount: all.filter((report) => report.status === "declined").length,
    };
  }, [newReports, submittedReports]);

  if (loading) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <CircularProgress />
          <Typography sx={{ color: "var(--app-text-muted)" }}>
            Loading previews...
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Review workspace"
        title="Report previews"
        description="Review new outputs, submit reports for approval, and manage already submitted preview packages from one responsive queue."
        action={
          <Button
            variant="outlined"
            startIcon={
              refreshing ? (
                <CircularProgress color="inherit" size={16} />
              ) : (
                <RefreshRounded />
              )
            }
            onClick={() => void handleManualRefresh()}
            disabled={loading || refreshing}
            sx={{ whiteSpace: "nowrap" }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            xl: "repeat(4, minmax(0, 1fr))",
          },
        }}
      >
        {[
          { label: "New", value: summary.newCount, color: "#2563eb" },
          { label: "Pending approval", value: summary.pendingCount, color: "#d97706" },
          { label: "Approved", value: summary.approvedCount, color: "#059669" },
          { label: "Declined", value: summary.declinedCount, color: "#dc2626" },
        ].map((item) => (
          <SurfaceCard key={item.label} sx={{ p: 2.5 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" sx={{ color: "var(--app-text)", mt: 1 }}>
                  {item.value}
                </Typography>
              </Box>
              <Avatar
                variant="rounded"
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 4,
                  bgcolor: `${item.color}1F`,
                  color: item.color,
                }}
              >
                <AutoAwesomeRounded />
              </Avatar>
            </Stack>
          </SurfaceCard>
        ))}
      </Box>

      <SectionPanel
        title="Preview queue"
        subtitle="Switch between new previews and submitted items awaiting the next step."
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ mb: 2.5 }}
        >
          <Tab value="new" label={`New (${newReports.length})`} />
          <Tab value="submitted" label={`Submitted (${submittedReports.length})`} />
        </Tabs>

        {reports.length === 0 ? (
          <EmptyState
            title={
              activeTab === "new" ? "No new previews" : "No submitted previews"
            }
            description={
              activeTab === "new"
                ? "Generate a new report to begin the review and submission flow."
                : "Submitted previews and approvals will appear here."
            }
            action={
              activeTab === "new" ? (
                <Button href="/dashboard" variant="contained">
                  Create new report
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Stack spacing={2}>
            {reports.map((report) => {
              const info = summaryForReport(report);
              const filesGenerating =
                Boolean((report as any).files_generating) ||
                Boolean((report as any).files_regenerating);
              const jobActive =
                report.status === "processing" ||
                (report as any).job_status === "queued" ||
                (report as any).job_status === "processing" ||
                filesGenerating;
              const jobFailed =
                report.status === "error" ||
                (report as any).job_status === "error";
              const canRetryFailedJob =
                jobFailed &&
                (report.reportType === "asset" || report.reportType === "lotListing") &&
                Boolean(
                  (report as any).preview_data ||
                    (Array.isArray((report as any).lots) && (report as any).lots.length > 0)
                );

              return (
                <SurfaceCard key={report._id} sx={{ p: 2.5 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      sx={{ justifyContent: "space-between" }}
                    >
                      <Stack spacing={1.4} sx={{ minWidth: 0 }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
                        >
                          <StatusPill label={info.typeLabel} color="info" />
                          <StatusBadge
                            status={jobActive ? "processing" : jobFailed ? "error" : (report.status as any)}
                          />
                        </Stack>
                        <Typography
                          variant="h6"
                          sx={{
                            color: "var(--app-text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {info.title}
                        </Typography>
                        <Typography sx={{ color: "var(--app-text-muted)" }}>
                          Created {new Date(report.createdAt).toLocaleDateString()}
                        </Typography>
                      </Stack>

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.25}
                        sx={{ alignItems: { xs: "stretch", sm: "center" } }}
                      >
                        {report.status === "preview" && !jobActive ? (
                          <Button
                            variant="contained"
                            startIcon={<VisibilityRounded />}
                            onClick={() => handleOpenPreview(report)}
                          >
                            Review & submit
                          </Button>
                        ) : null}

                        {report.status === "declined" ? (
                          <Button
                            variant="contained"
                            color="error"
                            startIcon={<EditRounded />}
                            onClick={() => handleOpenPreview(report)}
                          >
                            Edit & resubmit
                          </Button>
                        ) : null}

                        {(report.status === "pending_approval" ||
                          report.status === "approved" ||
                          jobActive) && (
                          <>
                            {!jobActive ? (
                              <>
                                <Button
                                  variant="outlined"
                                  startIcon={<EditRounded />}
                                  onClick={() => handleOpenPreview(report, true)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="text"
                                  startIcon={<RefreshRounded />}
                                  onClick={() => handleQuickResubmit(report)}
                                  disabled={resubmitting === report._id}
                                >
                                  {resubmitting === report._id
                                    ? "Resubmitting..."
                                    : "Quick resubmit"}
                                </Button>
                              </>
                            ) : (
                              <Button disabled startIcon={<RefreshRounded />}>
                                {activeTab === "new" ? "Generating preview" : "Generating files"}
                              </Button>
                            )}
                          </>
                        )}

                        {canRetryFailedJob ? (
                          <Button
                            variant="outlined"
                            startIcon={<RefreshRounded />}
                            onClick={() => handleQuickResubmit(report)}
                            disabled={resubmitting === report._id}
                          >
                            {resubmitting === report._id
                              ? "Retrying..."
                              : "Retry generation"}
                          </Button>
                        ) : null}

                        <Button
                          color="error"
                          variant="text"
                          startIcon={<DeleteOutlineRounded />}
                          onClick={() => setDeleteTarget(report)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: "grid",
                        gap: 1.5,
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(2, minmax(0, 1fr))",
                          xl: "repeat(4, minmax(0, 1fr))",
                        },
                      }}
                    >
                      {info.fields.map(([label, value]) => (
                        <Box
                          key={label}
                          sx={{
                            p: 1.6,
                            borderRadius: 3,
                            bgcolor: "rgba(148,163,184,0.08)",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}
                          >
                            {label}
                          </Typography>
                          <Typography sx={{ mt: 0.5, color: "var(--app-text)" }}>
                            {value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>

                    {report.status === "declined" && report.decline_reason ? (
                      <Alert severity="error">{report.decline_reason}</Alert>
                    ) : null}

                    {report.status === "pending_approval" ? (
                      <Alert severity="warning">
                        Awaiting admin approval before files can move forward.
                      </Alert>
                    ) : null}
                    {report.status === "approved" ? (
                      <Alert severity="success">
                        Approved. You can still edit and resubmit if needed.
                      </Alert>
                    ) : null}
                    {jobActive ? (
                      <Alert severity="info">
                        {activeTab === "new"
                          ? "Preview generation is running in the background. You will receive an email when it is ready."
                          : "Files are currently being generated or regenerated in the background."}
                      </Alert>
                    ) : null}
                    {jobFailed ? (
                      <Alert severity="error">
                        {(report as any).job_error ||
                          (report as any).error_message ||
                          "This report failed to process. Please try again or contact an admin."}
                      </Alert>
                    ) : null}

                    {!jobActive && ((report as any).preview_files?.spec_pdf || (report as any).preview_files?.cr_docx || (report as any).preview_files?.docx) ? (
                      <Stack direction="row" spacing={1}>
                        {(report as any).preview_files?.spec_pdf ? (
                          <Button
                            component="a"
                            href={(report as any).preview_files.spec_pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            startIcon={<SendRounded />}
                          >
                            CR
                          </Button>
                        ) : null}
                        {(report as any).preview_files?.cr_docx ? (
                          <Button
                            component="a"
                            href={(report as any).preview_files.cr_docx}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            startIcon={<SendRounded />}
                          >
                            CR DOCX
                          </Button>
                        ) : null}
                        {(report as any).preview_files?.docx ? (
                          <Button
                            component="a"
                            href={(report as any).preview_files.docx}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            startIcon={<SendRounded />}
                          >
                            Download DOCX
                          </Button>
                        ) : null}
                      </Stack>
                    ) : null}
                  </Stack>
                </SurfaceCard>
              );
            })}
          </Stack>
        )}
      </SectionPanel>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete preview?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "var(--app-text-muted)" }}>
            This will permanently remove the selected preview and its associated data.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={handleDeleteReport}
            disabled={deleting === deleteTarget?._id}
          >
            {deleting === deleteTarget?._id ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {selectedReportId && previewModalOpen ? (
        <PreviewModal
          reportId={selectedReportId}
          isOpen={previewModalOpen}
          onClose={handleModalClose}
          onSuccess={handleSuccess}
          isResubmitMode={isResubmitMode}
        />
      ) : null}
      {selectedReportId && realEstateModalOpen ? (
        <RealEstatePreviewModal
          reportId={selectedReportId}
          isOpen={realEstateModalOpen}
          onClose={handleModalClose}
          onSuccess={handleSuccess}
        />
      ) : null}
      {selectedReportId && lotListingModalOpen ? (
        <LotListingPreviewModal
          reportId={selectedReportId}
          isOpen={lotListingModalOpen}
          onClose={handleModalClose}
          onSuccess={handleSuccess}
          isResubmitMode={isResubmitMode}
        />
      ) : null}
    </Stack>
  );
}
