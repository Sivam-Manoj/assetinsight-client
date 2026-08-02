"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CarFront,
  CircleDollarSign,
  Clock3,
  FileText,
  PackageSearch,
  Rows3,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import BottomDrawer from "@/components/BottomDrawer";
import Loading from "@/components/common/Loading";
import { WorkspaceClock } from "@/components/dashboard/WorkspaceClock";
import type { DraftStatus } from "@/components/forms/ui/FormUI";
import { useAuthContext } from "@/context/AuthContext";
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

const DRAWER_TITLES: Record<Exclude<DrawerType, null>, string> = {
  "real-estate": "Create real estate report",
  salvage: "Create salvage report",
  asset: "Create asset report",
  "lot-listing": "Create lot listing",
};

const REPORT_ACTIONS = [
  {
    key: "real-estate" as const,
    title: "Real estate",
    description: "Property valuation and market evidence.",
    icon: Building2,
  },
  {
    key: "asset" as const,
    title: "Asset report",
    description: "Structured plant, equipment, and asset appraisal.",
    icon: PackageSearch,
  },
  {
    key: "lot-listing" as const,
    title: "Lot listing",
    description: "Auction-ready grouped lots and descriptions.",
    icon: Rows3,
  },
  {
    key: "salvage" as const,
    title: "Salvage",
    description: "Vehicle and equipment damage inspection.",
    icon: CarFront,
  },
] as const;

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

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
    .slice(0, 6);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: typeof FileText;
}) {
  return (
    <div className={`app-surface ${styles.metric}`}>
      <div className={styles.metricHeader}>
        <span className={styles.metricLabel}>{label}</span>
        <Icon className={styles.metricIcon} size={17} strokeWidth={1.8} aria-hidden />
      </div>
      <div className={styles.metricValue}>{value}</div>
      <div className={styles.metricHint}>{hint}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthContext();
  const router = useRouter();
  const [drawerType, setDrawerType] = useState<DrawerType>(null);
  const [greetingLabel, setGreetingLabel] = useState("Welcome");
  const [draftStatus, setDraftStatus] = useState<{
    status: DraftStatus;
    label?: string;
  } | null>(null);

  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    mutate: mutateStats,
  } = useSWR<ReportStats>("dashboard/report-stats", ReportsService.getReportStats);
  const {
    data: allReports,
    error: reportsError,
    isLoading: reportsLoading,
    mutate: mutateReports,
  } = useSWR<PdfReport[]>("dashboard/recent-reports", ReportsService.getMyReports);

  const recent = useMemo(() => latestReports(allReports), [allReports]);
  const breakdown = Object.entries(stats?.breakdown?.counts ?? {});
  const maxBreakdown = Math.max(1, ...breakdown.map(([, count]) => count));

  const refreshDashboard = useCallback(() => {
    void Promise.all([mutateStats(), mutateReports()]);
  }, [mutateReports, mutateStats]);

  useEffect(() => {
    setGreetingLabel(greeting());
  }, []);

  useEffect(() => {
    window.addEventListener("cv:report-created", refreshDashboard);
    return () =>
      window.removeEventListener("cv:report-created", refreshDashboard);
  }, [refreshDashboard]);

  useEffect(() => {
    const openAsset = (event: Event) => {
      if ((event as CustomEvent).detail) setDrawerType("asset");
    };
    const openRealEstate = (event: Event) => {
      if ((event as CustomEvent).detail) setDrawerType("real-estate");
    };
    window.addEventListener("load-saved-input", openAsset);
    window.addEventListener("load-realestate-input", openRealEstate);
    return () => {
      window.removeEventListener("load-saved-input", openAsset);
      window.removeEventListener("load-realestate-input", openRealEstate);
    };
  }, []);

  useEffect(() => setDraftStatus(null), [drawerType]);

  const closeDrawer = useCallback(() => {
    setDrawerType(null);
    setDraftStatus(null);
    refreshDashboard();
  }, [refreshDashboard]);

  const error = statsError || reportsError;
  const displayName = user?.username || user?.email?.split("@")[0] || "there";
  const totalPending =
    allReports?.filter((report) => report.approvalStatus === "pending").length ??
    0;

  return (
    <div className="app-page app-page-stack">
      <section className={`app-surface ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="app-kicker">Workspace overview</span>
          <h1 className="app-title" style={{ marginTop: 5 }}>
            {greetingLabel}, {displayName}
          </h1>
          <p className="app-subtitle">
            Your valuation activity, recent output, and report workflows in one
            clear view.
          </p>
        </div>
        <div className={styles.heroMeta} aria-label="Current date and time">
          <span className={styles.clockIcon}>
            <Clock3 size={19} strokeWidth={1.8} aria-hidden />
          </span>
          <WorkspaceClock />
        </div>
      </section>

      {error ? (
        <div className="app-alert app-alert--error" role="alert">
          We couldn’t load all dashboard data. Your report workflows are still
          available.
          <button className="app-button" onClick={refreshDashboard}>
            Retry
          </button>
        </div>
      ) : null}

      <section className={styles.metrics} aria-label="Reporting summary">
        <Metric
          label="Total reports"
          value={statsLoading ? "—" : stats?.totalReports ?? 0}
          hint="Across all report types"
          icon={FileText}
        />
        <Metric
          label="Portfolio value"
          value={
            statsLoading
              ? "—"
              : CURRENCY.format(stats?.totalFairMarketValue ?? 0)
          }
          hint="Aggregated fair market value"
          icon={CircleDollarSign}
        />
        <Metric
          label="Awaiting approval"
          value={reportsLoading ? "—" : totalPending}
          hint="Reports currently in review"
          icon={Clock3}
        />
        <Metric
          label="Valuation methods"
          value={statsLoading ? "—" : breakdown.length}
          hint="Methods in the current portfolio"
          icon={BarChart3}
        />
      </section>

      <section className="app-surface app-section">
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Start a new report</h2>
            <p className={styles.sectionSubtitle}>
              Choose a workflow. The form loads only when you open it.
            </p>
          </div>
        </div>
        <div className={styles.quickGrid}>
          {REPORT_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                className={styles.quickAction}
                onClick={() => setDrawerType(action.key)}
              >
                <div className={styles.quickTop}>
                  <Icon size={22} strokeWidth={1.7} color="var(--app-accent)" aria-hidden />
                  <ArrowRight size={17} strokeWidth={1.8} aria-hidden />
                </div>
                <div>
                  <div className={styles.quickTitle}>{action.title}</div>
                  <p className={styles.quickDescription}>{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.operations}>
        <div className={`app-surface app-section ${styles.recent}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Recent reports</h2>
              <p className={styles.sectionSubtitle}>
                Latest generated output across your workspace.
              </p>
            </div>
            <button
              className="app-button app-button--secondary"
              onClick={() => router.push("/reports")}
            >
              View all
              <ArrowRight size={15} aria-hidden />
            </button>
          </div>
          {reportsLoading ? (
            <div className={styles.empty}>
              <span className="app-spinner" aria-hidden />
              <span className="sr-only">Loading recent reports</span>
            </div>
          ) : recent.length ? (
            <div className="app-table-wrap">
              <table className="app-table app-table--responsive">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((report) => (
                    <tr key={report._id}>
                      <td data-label="Report">
                        <div className={styles.reportName}>
                          {report.filename || report.address || "Untitled report"}
                        </div>
                        <div className={styles.reportMeta}>
                          {report.contract_no || report.address || "Asset Insight"}
                        </div>
                      </td>
                      <td data-label="Type">{report.type || report.fileType || "Report"}</td>
                      <td data-label="Status">
                        <span className={styles.status}>
                          {report.approvalStatus || "generated"}
                        </span>
                      </td>
                      <td data-label="Created">
                        {DATE.format(new Date(report.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              Your generated reports will appear here.
            </div>
          )}
        </div>

        <div className="app-surface app-section">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Method distribution</h2>
              <p className={styles.sectionSubtitle}>Reports by valuation method.</p>
            </div>
          </div>
          {statsLoading ? (
            <div className={styles.empty}>
              <span className="app-spinner" aria-hidden />
            </div>
          ) : breakdown.length ? (
            <div className={styles.distribution}>
              {breakdown.map(([method, count]) => (
                <div className={styles.distributionRow} key={method}>
                  <div className={styles.distributionLabel}>
                    <span>{method}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className={styles.track}>
                    <div
                      className={styles.bar}
                      style={{ width: `${Math.max(4, (count / maxBreakdown) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>No valuation mix available yet.</div>
          )}
        </div>
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
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        ) : drawerType === "lot-listing" ? (
          <LotListingForm
            onSuccess={closeDrawer}
            onCancel={closeDrawer}
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        ) : null}
      </BottomDrawer>
    </div>
  );
}
