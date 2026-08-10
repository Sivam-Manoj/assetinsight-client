"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  BarChart3,
  Building2,
  CarFront,
  ChevronRight,
  FilePlus2,
  FileText,
  Inbox,
  Info,
  MoreHorizontal,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import BottomDrawer from "@/components/BottomDrawer";
import Loading from "@/components/common/Loading";
import { WorkspaceClock } from "@/components/dashboard/WorkspaceClock";
import type { DraftStatus } from "@/components/forms/ui/FormUI";
import { ReportThumbnail } from "@/components/reports/ReportThumbnail";
import { useAuthContext } from "@/context/AuthContext";
import { AuctioneerService } from "@/services/auctioneer";
import {
  draftKindForRecord,
  type ReportDraftRecord,
} from "@/services/reportDrafts";
import {
  ReportsService,
  type PdfReport,
  type ReportStats,
} from "@/services/reports";
import styles from "./Dashboard.module.css";

const RealEstateForm = dynamic(() => import("@/components/forms/RealEstateForm"), {
  ssr: false,
  loading: () => <Loading message="Loading real estate workflow…" />,
});
const SalvageForm = dynamic(() => import("@/components/forms/SalvageForm"), {
  ssr: false,
  loading: () => <Loading message="Loading salvage workflow…" />,
});
const AssetForm = dynamic(() => import("@/components/forms/AssetForm"), {
  ssr: false,
  loading: () => <Loading message="Loading asset workflow…" />,
});
const LotListingForm = dynamic(
  () => import("@/components/forms/LotListingForm"),
  {
    ssr: false,
    loading: () => <Loading message="Loading lot listing workflow…" />,
  }
);

type DrawerType = "real-estate" | "salvage" | "asset" | "lot-listing" | null;
type LocalDraftKind = "asset" | "lot-listing";

type IncomingSummary = {
  availableCount: number;
  showBadge: boolean;
};

const DRAWER_TITLES: Record<Exclude<DrawerType, null>, string> = {
  "real-estate": "Create real estate report",
  salvage: "Create salvage report",
  asset: "Create asset report",
  "lot-listing": "Create lot listing",
};

const REPORT_ACTIONS = [
  {
    key: "asset" as const,
    title: "Asset Report",
    icon: FileText,
  },
  {
    key: "lot-listing" as const,
    title: "Lot Listing",
    icon: Tag,
  },
  {
    key: "real-estate" as const,
    title: "Real Estate",
    icon: Building2,
  },
  {
    key: "salvage" as const,
    title: "Salvage",
    icon: CarFront,
  },
] as const;

const COMPACT_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const REPORT_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const UPDATED_DATE = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

const METHOD_LABELS: Record<string, string> = {
  fairmarketvalue: "FMV",
  fairmarket: "FMV",
  fmv: "FMV",
  orderlyliquidationvalue: "OLV",
  orderlyliquidation: "OLV",
  olv: "OLV",
  forcedliquidationvalue: "FLV",
  forcedliquidation: "FLV",
  flv: "FLV",
  totalkeptvalue: "TKV",
  tkv: "TKV",
};

function latestReports(values: PdfReport[] = []) {
  const grouped = new Map<string, PdfReport>();

  values.forEach((report) => {
    const key = String(report.report || report._id);
    const existing = grouped.get(key);
    if (
      !existing ||
      new Date(report.createdAt).getTime() >
        new Date(existing.createdAt).getTime()
    ) {
      grouped.set(key, report);
    }
  });

  return Array.from(grouped.values())
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function navSummaryFetcher(): Promise<IncomingSummary> {
  return Promise.all([
    AuctioneerService.getStatus(),
    AuctioneerService.getIncomingSummary(),
  ]).then(([status, summary]) => ({
    availableCount: summary.availableCount,
    showBadge: status.enabled && status.configured,
  }));
}

function visibleRefreshInterval() {
  if (
    typeof document === "undefined" ||
    typeof navigator === "undefined"
  ) {
    return 60_000;
  }
  return document.visibilityState === "visible" && navigator.onLine
    ? 60_000
    : 0;
}

function formatReportValue(value?: string) {
  if (!value) return "—";
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? REPORT_CURRENCY.format(parsed) : value;
}

function reportTitle(report: PdfReport) {
  return (
    report.filename?.replace(/\.(pdf|docx?|xlsx)$/i, "") ||
    report.address ||
    report.contract_no ||
    "Untitled report"
  );
}

function reportStatus(report: PdfReport) {
  if (report.downloadable === false) {
    return { label: "Generating", tone: "info" };
  }
  if (report.approvalStatus === "pending") {
    return { label: "In review", tone: "warning" };
  }
  if (report.approvalStatus === "rejected") {
    return { label: "Needs changes", tone: "danger" };
  }
  return { label: "Ready", tone: "success" };
}

function typeLabel(report: PdfReport) {
  const value = String(report.type || report.fileType || "").toLowerCase();
  if (value.includes("real")) return "Real Estate";
  if (value.includes("lot")) return "Lot Listing";
  if (value.includes("salvage")) return "Salvage";
  return "Asset Report";
}

function methodLabel(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return METHOD_LABELS[normalized] || value;
}

function Metric({
  label,
  value,
  icon: Icon,
  emphasized = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  emphasized?: boolean;
}) {
  return (
    <div className={styles.metric} data-emphasized={emphasized}>
      <div>
        <div className={styles.metricLabel}>{label}</div>
        <div className={styles.metricValue}>{value}</div>
      </div>
      <span className={styles.metricIcon}>
        <Icon size={25} strokeWidth={1.75} aria-hidden />
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { user, sessionPresent } = useAuthContext();
  const userId = user?._id || user?.id;
  const requestOwner = userId || (sessionPresent ? "pending-session" : null);
  const router = useRouter();
  const [drawerType, setDrawerType] = useState<DrawerType>(null);
  const [resumeLocalDraftKind, setResumeLocalDraftKind] =
    useState<LocalDraftKind | null>(null);
  const [resumeLocalDraftScopeId, setResumeLocalDraftScopeId] = useState<
    string | null
  >(null);
  const [resumeReportDraft, setResumeReportDraft] =
    useState<ReportDraftRecord | null>(null);
  const [greetingLabel] = useState(greeting);
  const [draftStatus, setDraftStatus] = useState<{
    status: DraftStatus;
    label?: string;
  } | null>(null);

  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    mutate: mutateStats,
  } = useSWR<ReportStats>(
    requestOwner ? ["dashboard/report-stats", requestOwner] : null,
    ReportsService.getReportStats,
    { keepPreviousData: false }
  );
  const {
    data: allReports,
    error: reportsError,
    isLoading: reportsLoading,
    mutate: mutateReports,
  } = useSWR<PdfReport[]>(
    requestOwner ? ["dashboard/recent-reports", requestOwner] : null,
    ReportsService.getMyReports,
    { keepPreviousData: false }
  );
  const {
    data: incomingSummary,
    error: incomingError,
    isLoading: incomingLoading,
  } = useSWR<IncomingSummary>(
    requestOwner ? ["auctioneer/navigation-summary", requestOwner] : null,
    navSummaryFetcher,
    {
      keepPreviousData: false,
      refreshInterval: visibleRefreshInterval,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
    }
  );

  const recent = useMemo(() => latestReports(allReports), [allReports]);
  const breakdown = useMemo(() => {
    const entries = Object.entries(stats?.breakdown?.counts ?? {})
      .filter(([, count]) => Number.isFinite(count) && count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    const maximum = Math.max(1, ...entries.map(([, count]) => count));

    return entries.map(([method, count]) => ({
      method: methodLabel(method),
      percentage: total ? Math.round((count / total) * 100) : 0,
      relativeWidth: Math.round((count / maximum) * 90),
    }));
  }, [stats?.breakdown?.counts]);

  const refreshDashboard = useCallback(() => {
    void Promise.all([mutateStats(), mutateReports()]);
  }, [mutateReports, mutateStats]);

  useEffect(() => {
    window.addEventListener("cv:report-created", refreshDashboard);
    return () =>
      window.removeEventListener("cv:report-created", refreshDashboard);
  }, [refreshDashboard]);

  useEffect(() => {
    const openAsset = (event: Event) => {
      if ((event as CustomEvent).detail) {
        setResumeLocalDraftKind(null);
        setResumeLocalDraftScopeId(null);
        setResumeReportDraft(null);
        setDrawerType("asset");
      }
    };
    const openRealEstate = (event: Event) => {
      if ((event as CustomEvent).detail) {
        setResumeLocalDraftKind(null);
        setResumeLocalDraftScopeId(null);
        setResumeReportDraft(null);
        setDrawerType("real-estate");
      }
    };
    const resumeLocalDraft = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          kind?: LocalDraftKind;
          scopeId?: string;
        }>
      ).detail;
      const kind = detail?.kind;
      if (kind !== "asset" && kind !== "lot-listing") return;
      setResumeLocalDraftKind(kind);
      setResumeLocalDraftScopeId(detail?.scopeId || null);
      setResumeReportDraft(null);
      setDrawerType(kind);
    };
    const resumeServerDraft = (event: Event) => {
      const draft = (event as CustomEvent<ReportDraftRecord>).detail;
      if (!draft?._id) return;
      const kind = draftKindForRecord(draft);
      setResumeLocalDraftKind(null);
      setResumeLocalDraftScopeId(null);
      setResumeReportDraft(draft);
      setDrawerType(kind);
    };
    window.addEventListener("load-saved-input", openAsset);
    window.addEventListener("load-realestate-input", openRealEstate);
    window.addEventListener("resume-local-draft", resumeLocalDraft);
    window.addEventListener("resume-report-draft", resumeServerDraft);
    return () => {
      window.removeEventListener("load-saved-input", openAsset);
      window.removeEventListener("load-realestate-input", openRealEstate);
      window.removeEventListener("resume-local-draft", resumeLocalDraft);
      window.removeEventListener("resume-report-draft", resumeServerDraft);
    };
  }, []);

  useEffect(() => setDraftStatus(null), [drawerType]);

  const closeDrawer = useCallback(() => {
    setDrawerType(null);
    setResumeLocalDraftKind(null);
    setResumeLocalDraftScopeId(null);
    setResumeReportDraft(null);
    setDraftStatus(null);
    refreshDashboard();
  }, [refreshDashboard]);

  const error = statsError || reportsError;
  const displayName = user?.username || user?.email?.split("@")[0] || "there";
  const incomingCount = incomingSummary?.availableCount ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title} suppressHydrationWarning>
            {greetingLabel}, {displayName}
          </h1>
          <p className={styles.subtitle}>
            <WorkspaceClock />
            <span className={styles.subtitleDivider} aria-hidden>
              •
            </span>
            <span>Keep reporting work moving from one place.</span>
          </p>
        </div>
        <button
          className={styles.createButton}
          onClick={() => {
            setResumeLocalDraftKind(null);
            setResumeReportDraft(null);
            setDrawerType("asset");
          }}
        >
          <FilePlus2 size={21} strokeWidth={1.8} aria-hidden />
          Create report
        </button>
      </header>

      {error ? (
        <div className="app-alert app-alert--error" role="alert">
          <span>
            We couldn’t load all dashboard data. Your report workflows are
            still available.
          </span>
          <button className="app-button" onClick={refreshDashboard}>
            Retry
          </button>
        </div>
      ) : null}

      <section className={styles.workflowStrip} aria-label="Create a report">
        {REPORT_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              className={styles.workflowButton}
              onClick={() => {
                setResumeLocalDraftKind(null);
                setResumeReportDraft(null);
                setDrawerType(action.key);
              }}
            >
              <Icon size={25} strokeWidth={1.7} aria-hidden />
              <span>{action.title}</span>
            </button>
          );
        })}
      </section>

      <section className={styles.summaryGrid} aria-label="Reporting summary">
        <div className={styles.summaryLeft}>
          <div className={styles.metricGrid}>
            <Metric
              label="Total reports"
              value={statsLoading ? "—" : stats?.totalReports ?? 0}
              icon={FileText}
            />
            <Metric
              label="Portfolio value"
              value={
                statsLoading
                  ? "—"
                  : COMPACT_CURRENCY.format(stats?.totalFairMarketValue ?? 0)
              }
              icon={BarChart3}
              emphasized
            />
          </div>

          <div className={styles.incomingCard}>
            <span className={styles.incomingIcon}>
              <Inbox size={24} strokeWidth={1.75} aria-hidden />
            </span>
            <div className={styles.incomingCopy}>
              <span>Incoming work</span>
              <strong>
                {incomingLoading
                  ? "Loading…"
                  : incomingError
                    ? "Queue unavailable"
                    : incomingSummary?.showBadge
                      ? `${incomingCount} available`
                      : "Integration unavailable"}
              </strong>
            </div>
            <button
              className={styles.textAction}
              onClick={() => router.push("/incoming")}
            >
              Open queue
              <ChevronRight size={17} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.distributionCard}>
          <div className={styles.distributionHeader}>
            <h2>Valuation method distribution</h2>
            <span
              className={styles.infoIcon}
              title="Share of reports by valuation method"
            >
              <Info size={18} strokeWidth={1.8} aria-hidden />
              <span className="sr-only">
                Share of reports by valuation method
              </span>
            </span>
          </div>

          {statsLoading ? (
            <div className={styles.distributionEmpty}>
              <span className="app-spinner" aria-label="Loading distribution" />
            </div>
          ) : breakdown.length ? (
            <div className={styles.distribution}>
              {breakdown.map(({ method, percentage, relativeWidth }) => (
                <div className={styles.distributionRow} key={method}>
                  <span className={styles.distributionLabel}>{method}</span>
                  <span className={styles.track} aria-hidden>
                    <span
                      className={styles.bar}
                      style={{ width: `${Math.max(3, relativeWidth)}%` }}
                    />
                  </span>
                  <span className={styles.percentage}>{percentage}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.distributionEmpty}>
              No valuation mix available yet.
            </div>
          )}
        </div>
      </section>

      <section className={styles.recentCard} aria-labelledby="recent-reports">
        <div className={styles.recentHeading}>
          <h2 id="recent-reports">Recent reports</h2>
          <button
            className={styles.viewAllButton}
            onClick={() => router.push("/reports")}
          >
            View all reports
            <ChevronRight size={17} strokeWidth={1.8} aria-hidden />
          </button>
        </div>

        {reportsLoading ? (
          <div className={styles.recentEmpty}>
            <span className="app-spinner" aria-label="Loading recent reports" />
          </div>
        ) : recent.length ? (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} app-table--responsive`}>
              <thead>
                <tr>
                  <th>
                    <span className={styles.sortHeading}>
                      Report
                      <ArrowUpDown size={14} aria-hidden />
                    </span>
                  </th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>
                    <span className={styles.sortHeading}>
                      Updated
                      <ArrowUpDown size={14} aria-hidden />
                    </span>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((report) => {
                  const status = reportStatus(report);
                  const title = reportTitle(report);
                  return (
                    <tr key={report._id}>
                      <td data-label="Report">
                        <div className={styles.reportIdentity}>
                          <ReportThumbnail
                            src={report.thumbnail_url || report.thumbnailUrl}
                            title={title}
                          />
                          <button
                            className={styles.reportLink}
                            onClick={() => router.push("/reports")}
                          >
                            {title}
                          </button>
                        </div>
                      </td>
                      <td data-label="Type">{typeLabel(report)}</td>
                      <td data-label="Value">
                        {formatReportValue(report.fairMarketValue)}
                      </td>
                      <td data-label="Status">
                        <span
                          className={styles.status}
                          data-tone={status.tone}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td data-label="Updated">
                        {UPDATED_DATE.format(new Date(report.createdAt))}
                      </td>
                      <td data-label="Action">
                        <button
                          className={styles.rowAction}
                          aria-label={`Open actions for ${title}`}
                          onClick={() => router.push("/reports")}
                        >
                          <MoreHorizontal size={20} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.recentEmpty}>
            Your generated reports will appear here.
          </div>
        )}

      </section>

      <BottomDrawer
        open={Boolean(drawerType)}
        onClose={closeDrawer}
        title={drawerType ? DRAWER_TITLES[drawerType] : undefined}
        description="Complete the required details, attach supporting media, and save or submit when ready."
        headerStatus={
          draftStatus ? (
            <span className={styles.draftStatus} data-status={draftStatus.status}>
              {draftStatus.label ??
                (draftStatus.status === "saving"
                  ? "Saving draft…"
                  : draftStatus.status === "saved"
                    ? "Draft saved"
                    : draftStatus.status === "dirty"
                      ? "Unsaved changes"
                      : "Draft status")}
            </span>
          ) : undefined
        }
        contentScrollable={false}
      >
        {drawerType === "real-estate" ? (
          <RealEstateForm onSuccess={closeDrawer} onCancel={closeDrawer} />
        ) : drawerType === "salvage" ? (
          <SalvageForm onSuccess={closeDrawer} onCancel={closeDrawer} />
        ) : drawerType === "asset" ? (
          <AssetForm
            onSuccess={closeDrawer}
            onCancel={closeDrawer}
            resumeDraft={resumeReportDraft?.type === "asset" ? resumeReportDraft : null}
            restoreDraftOnMount={resumeLocalDraftKind === "asset"}
            resumeLocalDraftScopeId={resumeLocalDraftScopeId || undefined}
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        ) : drawerType === "lot-listing" ? (
          <LotListingForm
            onSuccess={closeDrawer}
            onCancel={closeDrawer}
            restoreDraftOnMount={resumeLocalDraftKind === "lot-listing"}
            resumeLocalDraftScopeId={resumeLocalDraftScopeId || undefined}
            resumeDraft={
              resumeReportDraft?.type === "lotListing" ? resumeReportDraft : null
            }
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        ) : null}
      </BottomDrawer>
    </div>
  );
}
