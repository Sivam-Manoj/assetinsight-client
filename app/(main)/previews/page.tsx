"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  FileSearch,
  Merge,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
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

const AssetMergeDialog = dynamic(
  () => import("@/components/reports/AssetMergeDialog"),
  { ssr: false }
);
const PreviewModal = dynamic(() => import("@/components/reports/PreviewModal"), {
  ssr: false,
});
const RealEstatePreviewModal = dynamic(
  () => import("@/components/reports/RealEstatePreviewModal"),
  { ssr: false }
);
const LotListingPreviewModal = dynamic(
  () => import("@/components/reports/LotListingPreviewModal"),
  { ssr: false }
);

type CombinedReport =
  | (AssetReport & { reportType: "asset" })
  | (RealEstateReport & { reportType: "realEstate" })
  | (LotListing & { reportType: "lotListing" });

type TabType = "new" | "submitted";

const WORKFLOW_LABELS: Record<string, string> = {
  preparing_preview: "Preparing preview",
  preview_ready: "Preview ready",
  generating_files: "Generating files",
  awaiting_approval: "Awaiting approval",
  awaiting_release: "Awaiting release",
  ready: "Ready to download",
  error: "Generation failed",
};

function isWorkflowActive(report: any): boolean {
  if (["preparing_preview", "generating_files"].includes(report?.workflow_stage)) return true;
  return (
    report?.generation_state === "queued" ||
    report?.generation_state === "processing" ||
    report?.job_status === "queued" ||
    report?.job_status === "processing"
  );
}

function workflowBadgeStatus(report: any) {
  const stage = report?.workflow_stage;
  if (stage === "error") return "error";
  if (stage === "preview_ready") return "preview";
  if (stage === "awaiting_approval" || stage === "awaiting_release") return "pending_approval";
  if (stage === "ready") return "approved";
  if (stage === "preparing_preview" || stage === "generating_files") return "processing";
  return report?.status || "draft";
}

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
  const hasActiveJobs = useMemo(
    () => [...newReports, ...submittedReports].some(isWorkflowActive),
    [newReports, submittedReports]
  );
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
  const [mergeAnchorId, setMergeAnchorId] = useState<string | null>(null);
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
          const wasSubmitted = Boolean(
            (report as any).preview_submitted_at ||
            (report as any).approval_requested_at
          );
          return (
            (report.status === "processing" ||
              report.status === "error" ||
              report.status === "preview" ||
              report.status === "declined") &&
            !wasSubmitted
          );
        })
        .map((report) => ({ ...report, reportType: "asset" as const }));

      const realEstatePreviews: CombinedReport[] = (realEstateResponse.data || [])
        .filter(
          (report: any) =>
            (report.status === "preview" || report.status === "declined") &&
            !report.preview_submitted_at &&
            !report.approval_requested_at
        )
        .map((report) => ({ ...report, reportType: "realEstate" as const }));

      const lotListingPreviews: CombinedReport[] = (lotListingResponse.data || [])
        .filter((report) => {
          const wasSubmitted = Boolean(
            (report as any).preview_submitted_at ||
            (report as any).approval_requested_at ||
            (report as any).generation_target_status === "approved" ||
            (report as any).generation_target_status === "pending_approval"
          );
          const generating =
            Boolean((report as any).files_generating) ||
            Boolean((report as any).files_regenerating);
          return (
            ((report.status === "processing" && !generating) ||
              report.status === "error" ||
              report.status === "preview" ||
              report.status === "declined") &&
            !wasSubmitted
          );
        })
        .map((report) => ({ ...report, reportType: "lotListing" as const }));

      const submittedAssets: CombinedReport[] = (submittedAssetResponse.data || [])
        .map((report) => ({ ...report, reportType: "asset" as const }));
      const realEstateSubmitted: CombinedReport[] = (realEstateResponse.data || [])
        .filter(
          (report: any) =>
            report.status === "pending_approval" ||
            report.status === "approved" ||
            Boolean(report.preview_submitted_at) ||
            Boolean(report.approval_requested_at)
        )
        .map((report) => ({ ...report, reportType: "realEstate" as const }));
      const lotListingSubmitted: CombinedReport[] = (submittedLotListingResponse.data || [])
        .map((report) => ({ ...report, reportType: "lotListing" as const }));

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
    const refreshOwnership = () => {
      if (document.visibilityState === "visible") {
        void loadReports({ silent: true });
      }
    };
    window.addEventListener("focus", refreshOwnership);
    document.addEventListener("visibilitychange", refreshOwnership);
    return () => {
      window.removeEventListener("focus", refreshOwnership);
      document.removeEventListener("visibilitychange", refreshOwnership);
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

  useEffect(() => {
    if (hasActiveJobs) return;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void loadReports({ silent: true });
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveJobs, loadReports]);

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

  const handleSuccess = (submittedReport?: any) => {
    const reportId = String(
      submittedReport?._id || submittedReport?.reportId || selectedReportId || ""
    );
    if (reportId) {
      const source = [...newReports, ...submittedReports].find(
        (report) => String(report._id) === reportId
      );
      if (source) {
        const nextReport = {
          ...source,
          ...(submittedReport || {}),
          _id: reportId,
          reportType: source.reportType,
          preview_submitted_at:
            submittedReport?.preview_submitted_at || new Date().toISOString(),
        } as CombinedReport;
        setNewReports((current) =>
          current.filter((report) => String(report._id) !== reportId)
        );
        setSubmittedReports((current) => [
          nextReport,
          ...current.filter((report) => String(report._id) !== reportId),
        ]);
      }
    }
    setActiveTab("submitted");
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

  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteTarget && !dialog.open) dialog.showModal();
    if (!deleteTarget && dialog.open) dialog.close();
  }, [deleteTarget]);

  if (loading) {
    return (
      <div
        className="grid min-h-[60vh] place-items-center"
        role="status"
        aria-label="Loading previews"
      >
        <div className="flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
          <RefreshCw className="size-4 animate-spin text-[var(--app-accent)]" />
          Loading previews...
        </div>
      </div>
    );
  }

  return (
    <main className="w-full min-w-0 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-accent)]">
            Review workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--app-text)] md:text-3xl">
            Report previews
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--app-text-muted)]">
            Review new outputs, submit reports for approval, and manage already
            submitted preview packages.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3.5 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void handleManualRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section
        aria-label="Preview summary"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {[
          {
            label: "New",
            value: summary.newCount,
            tone: "text-[var(--app-accent)] bg-[var(--app-accent-soft)]",
          },
          {
            label: "Pending approval",
            value: summary.pendingCount,
            tone: "text-[var(--app-warning)] bg-[var(--app-warning-soft)]",
          },
          {
            label: "Approved",
            value: summary.approvedCount,
            tone: "text-[var(--app-success)] bg-[var(--app-success-soft)]",
          },
          {
            label: "Declined",
            value: summary.declinedCount,
            tone: "text-[var(--app-danger)] bg-[var(--app-danger-soft)]",
          },
        ].map((item) => (
          <article
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
          >
            <div>
              <p className="text-xs font-semibold text-[var(--app-text-muted)] sm:text-sm">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--app-text)]">
                {item.value}
              </p>
            </div>
            <span
              className={`grid size-9 place-items-center rounded-lg sm:size-10 ${item.tone}`}
              aria-hidden="true"
            >
              <Sparkles className="size-4" />
            </span>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)]">
        <div className="border-b border-[var(--app-border)] px-4 pt-4 sm:px-5">
          <h2 className="font-semibold text-[var(--app-text)]">Preview queue</h2>
          <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">
            Switch between new previews and submitted items awaiting the next
            step.
          </p>
          <div
            className="mt-4 flex gap-1"
            role="tablist"
            aria-label="Preview queue"
          >
            {[
              { id: "new" as const, label: "New", count: newReports.length },
              {
                id: "submitted" as const,
                label: "Submitted",
                count: submittedReports.length,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`preview-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="preview-tabpanel"
                className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${
                  activeTab === tab.id
                    ? "border-[var(--app-accent)] text-[var(--app-accent)]"
                    : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        <div
          id="preview-tabpanel"
          role="tabpanel"
          aria-labelledby={`preview-tab-${activeTab}`}
        >
          {reports.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileSearch className="mx-auto size-6 text-[var(--app-text-muted)]" />
              <h3 className="mt-3 font-semibold text-[var(--app-text)]">
                {activeTab === "new"
                  ? "No new previews"
                  : "No submitted previews"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-text-muted)]">
                {activeTab === "new"
                  ? "Generate a new report to begin the review and submission flow."
                  : "Submitted previews and approvals will appear here."}
              </p>
              {activeTab === "new" ? (
                <a
                  href="/dashboard"
                  className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-[var(--app-accent)] px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Create new report
                </a>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--app-border)]">
              {reports.map((report) => {
                const info = summaryForReport(report);
                const jobActive = isWorkflowActive(report);
                const jobFailed =
                  (report as any).workflow_stage === "error" ||
                  report.status === "error" ||
                  (report as any).job_status === "error";
                const canRetryFailedJob =
                  jobFailed &&
                  (report.reportType === "asset" ||
                    report.reportType === "lotListing") &&
                  Boolean(
                    (report as any).preview_data ||
                      (Array.isArray((report as any).lots) &&
                        (report as any).lots.length > 0)
                  );
                const badgeStatus = workflowBadgeStatus(report);
                const badgeLabel =
                  WORKFLOW_LABELS[(report as any).workflow_stage] ||
                  String(badgeStatus).replace(/_/g, " ");
                const badgeTone =
                  badgeStatus === "error" || badgeStatus === "declined"
                    ? "bg-[var(--app-danger-soft)] text-[var(--app-danger)]"
                    : badgeStatus === "approved"
                      ? "bg-[var(--app-success-soft)] text-[var(--app-success)]"
                      : badgeStatus === "pending_approval"
                        ? "bg-[var(--app-warning-soft)] text-[var(--app-warning)]"
                        : "bg-[var(--app-accent-soft)] text-[var(--app-accent)]";
                const progress = Math.max(
                  2,
                  Number(
                    (report as any).workflow_progress_percent ??
                      (report as any).generation_progress?.progressPercent ??
                      0
                  )
                );

                return (
                  <li key={report._id} className="px-4 py-5 sm:px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-[var(--app-accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--app-accent)]">
                            {info.typeLabel}
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${badgeTone}`}
                          >
                            {badgeLabel}
                          </span>
                          {report.reportType === "asset" &&
                          (report as any).is_merged_report ? (
                            <span className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-text-muted)]">
                              Merged ·{" "}
                              {Array.isArray(
                                (report as any).merged_from_report_ids
                              )
                                ? (report as any).merged_from_report_ids.length
                                : 2}{" "}
                              sources
                            </span>
                          ) : null}
                          {(report as any).preview_transferred_at ? (
                            <span className="rounded-md bg-[var(--app-warning-soft)] px-2 py-1 text-xs font-semibold text-[var(--app-warning)]">
                              Assigned by admin
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 break-words font-semibold text-[var(--app-text)]">
                          {info.title}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                          Created{" "}
                          {new Date(report.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:max-w-[520px] lg:justify-end">
                        {report.status === "preview" && !jobActive ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-white hover:opacity-90"
                            onClick={() => handleOpenPreview(report)}
                          >
                            <FileSearch className="size-3.5" />
                            Review & submit
                          </button>
                        ) : null}

                        {report.status === "declined" ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-white hover:opacity-90"
                            onClick={() => handleOpenPreview(report)}
                          >
                            <Pencil className="size-3.5" />
                            Edit & resubmit
                          </button>
                        ) : null}

                        {(report.status === "pending_approval" ||
                          report.status === "approved" ||
                          jobActive) &&
                        !jobActive ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]"
                              onClick={() => handleOpenPreview(report, true)}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:opacity-40"
                              onClick={() => void handleQuickResubmit(report)}
                              disabled={resubmitting === report._id}
                            >
                              <RefreshCw
                                className={`size-3.5 ${
                                  resubmitting === report._id
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                              {resubmitting === report._id
                                ? "Resubmitting..."
                                : "Quick resubmit"}
                            </button>
                          </>
                        ) : null}

                        {jobActive ? (
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--app-accent-soft)] px-3 text-xs font-semibold text-[var(--app-accent)]">
                            <RefreshCw className="size-3.5 animate-spin" />
                            {WORKFLOW_LABELS[
                              (report as any).workflow_stage
                            ] ||
                              (activeTab === "new"
                                ? "Preparing preview"
                                : "Generating files")}
                          </span>
                        ) : null}

                        {canRetryFailedJob ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)] disabled:opacity-40"
                            onClick={() => void handleQuickResubmit(report)}
                            disabled={resubmitting === report._id}
                          >
                            <RefreshCw className="size-3.5" />
                            {resubmitting === report._id
                              ? "Retrying..."
                              : "Retry generation"}
                          </button>
                        ) : null}

                        {report.reportType === "asset" && !jobActive ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-panel-alt)]"
                            onClick={() => setMergeAnchorId(report._id)}
                          >
                            <Merge className="size-3.5" />
                            Merge assets
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-danger-border)] px-3 text-xs font-semibold text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]"
                          onClick={() => setDeleteTarget(report)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {info.fields.map(([label, value]) => (
                        <div
                          key={label}
                          className="min-w-0 rounded-lg bg-[var(--app-panel-alt)] px-3 py-2.5"
                        >
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                            {label}
                          </dt>
                          <dd className="mt-1 break-words text-sm font-medium text-[var(--app-text)]">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {report.status === "declined" &&
                    report.decline_reason ? (
                      <div
                        role="alert"
                        className="mt-4 rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-3 py-2.5 text-sm text-[var(--app-danger)]"
                      >
                        {report.decline_reason}
                      </div>
                    ) : null}
                    {(report as any).workflow_stage ===
                    "awaiting_approval" ? (
                      <div className="mt-4 rounded-lg border border-[var(--app-warning-border)] bg-[var(--app-warning-soft)] px-3 py-2.5 text-sm text-[var(--app-warning)]">
                        Files are ready and awaiting the assigned report
                        approver.
                      </div>
                    ) : null}
                    {(report as any).workflow_stage === "awaiting_release" ? (
                      <div className="mt-4 rounded-lg border border-[var(--app-warning-border)] bg-[var(--app-warning-soft)] px-3 py-2.5 text-sm text-[var(--app-warning)]">
                        Approved and awaiting the assigned release manager.
                      </div>
                    ) : null}

                    {jobActive ? (
                      <div className="mt-4 rounded-lg bg-[var(--app-accent-soft)] px-3 py-3">
                        <div className="flex justify-between gap-3 text-xs font-semibold text-[var(--app-accent)]">
                          <span>
                            {(report as any).workflow_message ||
                              (report as any).generation_progress?.message ||
                              (activeTab === "new"
                                ? "Preparing preview"
                                : "Generating files")}
                          </span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(progress)}
                        >
                          <span
                            className="block h-full rounded-full bg-[var(--app-accent)]"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        {(report as any).generation_progress?.totalLots ? (
                          <p className="mt-1.5 text-xs text-[var(--app-text-muted)]">
                            Lot{" "}
                            {(report as any).generation_progress.currentLot ||
                              0}{" "}
                            of{" "}
                            {(report as any).generation_progress.totalLots}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {jobFailed ? (
                      <div
                        role="alert"
                        className="mt-4 rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-3 py-2.5 text-sm text-[var(--app-danger)]"
                      >
                        {(report as any).job_error ||
                          (report as any).error_message ||
                          "This report failed to process. Please try again or contact an admin."}
                      </div>
                    ) : null}

                    {!jobActive &&
                    ((report as any).preview_files?.spec_pdf ||
                      (report as any).preview_files?.cr_docx ||
                      (report as any).preview_files?.docx) ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--app-border)] pt-3">
                        {[
                          [
                            "CR",
                            (report as any).preview_files?.spec_pdf,
                          ],
                          [
                            "CR DOCX",
                            (report as any).preview_files?.cr_docx,
                          ],
                          [
                            "Download DOCX",
                            (report as any).preview_files?.docx,
                          ],
                        ].map(([label, href]) =>
                          href ? (
                            <a
                              key={label}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-text)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]"
                            >
                              <Download className="size-3.5" />
                              {label}
                            </a>
                          ) : null
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby="delete-preview-title"
        className="m-auto w-[min(92vw,460px)] rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-0 text-[var(--app-text)] shadow-[var(--app-shadow-modal)] backdrop:bg-[var(--app-overlay)]"
        onCancel={(event) => {
          if (deleting) event.preventDefault();
          else setDeleteTarget(null);
        }}
        onClose={() => {
          if (deleteTarget && !deleting) setDeleteTarget(null);
        }}
      >
        <div className="p-5">
          <h2 id="delete-preview-title" className="text-lg font-bold">
            Delete preview?
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            This permanently removes the selected preview and its associated
            data.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="min-h-10 rounded-lg border border-[var(--app-border)] px-4 text-sm font-semibold hover:bg-[var(--app-panel-alt)]"
              onClick={() => setDeleteTarget(null)}
              disabled={Boolean(deleting)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg bg-[var(--app-danger)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              onClick={() => void handleDeleteReport()}
              disabled={deleting === deleteTarget?._id}
            >
              {deleting === deleteTarget?._id ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </dialog>

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
      {mergeAnchorId ? (
        <AssetMergeDialog
          open
          anchorReportId={mergeAnchorId}
          onClose={() => setMergeAnchorId(null)}
          onCreated={() => {
            setMergeAnchorId(null);
            setActiveTab("new");
            requestReportsRefetch();
            void loadReports();
          }}
        />
      ) : null}
    </main>
  );
}
