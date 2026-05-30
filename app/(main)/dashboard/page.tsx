"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowForwardRounded,
  CalendarMonthRounded,
  TrendingUpRounded,
  TroubleshootRounded,
} from "@mui/icons-material";
import BottomDrawer from "@/components/BottomDrawer";
import Loading from "@/components/common/Loading";
import { AppIcon } from "@/components/common/AppIcon";
import {
  MetricCard,
  SectionPanel,
  StatusPill,
  SurfaceCard,
} from "@/components/common/WorkspaceUI";
import { useAuthContext } from "@/context/AuthContext";
import {
  ReportsService,
  type PdfReport,
  type ReportStats,
} from "@/services/reports";

const RealEstateForm = dynamic(() => import("@/components/forms/RealEstateForm"), {
  ssr: false,
  loading: () => (
    <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
      <Loading message="Loading form..." height={140} width={140} />
    </Box>
  ),
});

const SalvageForm = dynamic(() => import("@/components/forms/SalvageForm"), {
  ssr: false,
  loading: () => (
    <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
      <Loading message="Loading form..." height={140} width={140} />
    </Box>
  ),
});

const AssetForm = dynamic(() => import("@/components/forms/AssetForm"), {
  ssr: false,
  loading: () => (
    <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
      <Loading message="Loading form..." height={140} width={140} />
    </Box>
  ),
});

const LotListingForm = dynamic(
  () => import("@/components/forms/LotListingForm"),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
        <Loading message="Loading form..." height={140} width={140} />
      </Box>
    ),
  }
);

type DrawerType = "real-estate" | "salvage" | "asset" | "lot-listing" | null;

const DRAWER_TITLES: Record<Exclude<DrawerType, null>, string> = {
  "real-estate": "Create Real Estate Report",
  salvage: "Create Salvage Report",
  asset: "Create Asset Report",
  "lot-listing": "Create Lot Listing",
};

const METHOD_COLORS: Record<string, string> = {
  FMV: "#2563eb",
  OLV: "#d97706",
  FLV: "#dc2626",
  TKV: "#7c3aed",
};

export default function DashboardPage() {
  const { user } = useAuthContext();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<DrawerType>(null);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [recent, setRecent] = useState<PdfReport[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      const data = await ReportsService.getMyReports();
      const groupMap = new Map<string, PdfReport>();
      for (const report of data) {
        const key = String(((report as any).report as string | undefined) || report._id);
        const existing = groupMap.get(key);
        if (
          !existing ||
          new Date(report.createdAt).getTime() >
            new Date(existing.createdAt).getTime()
        ) {
          groupMap.set(key, report);
        }
      }
      const grouped = Array.from(groupMap.values()).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRecent(grouped.slice(0, 5));
    } catch (error: any) {
      setRecentError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load recent reports"
      );
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    ReportsService.getReportStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((error: any) => {
        if (!cancelled) {
          setStatsError(
            error?.response?.data?.message ||
              error?.message ||
              "Failed to load stats"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchRecent();
    const handler = () => fetchRecent();
    window.addEventListener("cv:report-created", handler);
    return () => window.removeEventListener("cv:report-created", handler);
  }, [fetchRecent]);

  useEffect(() => {
    const savedInputHandler = (event: CustomEvent) => {
      if (event.detail) {
        setDrawerType("asset");
        setDrawerOpen(true);
      }
    };
    const realEstateHandler = (event: CustomEvent) => {
      if (event.detail) {
        setDrawerType("real-estate");
        setDrawerOpen(true);
      }
    };
    window.addEventListener("load-saved-input" as any, savedInputHandler as any);
    window.addEventListener(
      "load-realestate-input" as any,
      realEstateHandler as any
    );
    return () => {
      window.removeEventListener(
        "load-saved-input" as any,
        savedInputHandler as any
      );
      window.removeEventListener(
        "load-realestate-input" as any,
        realEstateHandler as any
      );
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timeAgo = (value: Date) => {
    const diff = value.getTime() - Date.now();
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ["year", 1000 * 60 * 60 * 24 * 365],
      ["month", 1000 * 60 * 60 * 24 * 30],
      ["week", 1000 * 60 * 60 * 24 * 7],
      ["day", 1000 * 60 * 60 * 24],
      ["hour", 1000 * 60 * 60],
      ["minute", 1000 * 60],
      ["second", 1000],
    ];
    const formatter = new Intl.RelativeTimeFormat("en-US", {
      numeric: "auto",
    });
    for (const [unit, size] of units) {
      if (Math.abs(diff) >= size || unit === "second") {
        return formatter.format(Math.round(diff / size), unit);
      }
    }
    return "just now";
  };

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

  const moduleCards = [
    {
      key: "real-estate" as const,
      title: "Real Estate",
      description: "Valuation-ready property reports with structured detail capture.",
      accent: "#059669",
      icon: "building" as const,
    },
    {
      key: "salvage" as const,
      title: "Salvage",
      description: "Inspection and liquidation workflows for vehicles and equipment.",
      accent: "#2563eb",
      icon: "car" as const,
    },
    {
      key: "asset" as const,
      title: "Asset",
      description: "General asset appraisals with reusable valuation templates.",
      accent: "#e11d48",
      icon: "package" as const,
    },
    {
      key: "lot-listing" as const,
      title: "Lot Listing",
      description: "Auction-ready grouped lots with exportable listing output.",
      accent: "#7c3aed",
      icon: "chart" as const,
    },
  ];

  return (
    <Stack spacing={3}>
      <SurfaceCard
        sx={{
          p: { xs: 2, md: 2.5 },
          background:
            "radial-gradient(circle at top left, rgba(225,29,72,0.08), transparent 24%), radial-gradient(circle at top right, rgba(37,99,235,0.08), transparent 28%), var(--app-panel)",
        }}
      >
        <Stack spacing={{ xs: 2, md: 2.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "flex-start" } }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: "var(--app-accent)" }}>
                Command center
              </Typography>
              <Typography
                sx={{
                  color: "var(--app-text)",
                  fontWeight: 800,
                  fontSize: { xs: "2rem", md: "2.6rem", xl: "3rem" },
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  mt: 0.5,
                }}
              >
                {mounted ? greeting : "Welcome"},{" "}
                {user?.username || user?.email || "there"}
              </Typography>
              <Typography
                sx={{
                  color: "var(--app-text-muted)",
                  mt: 1,
                  maxWidth: 760,
                  fontSize: { xs: 15, md: 17 },
                }}
              >
                Monitor appraisal activity, manage recent output, and keep reporting
                work moving from one responsive workspace.
              </Typography>
            </Box>
          </Stack>

          <Box
            sx={{
              display: "grid",
              gap: { xs: 1.25, md: 1.5, xl: 2 },
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
              },
              alignItems: "stretch",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "minmax(0, 1.05fr) minmax(280px, 0.95fr)",
                },
              }}
            >
              <Box
                sx={{
                  minWidth: 0,
                  p: { xs: 1.5, md: 1.75 },
                  borderRadius: 3,
                  border: "1px solid var(--app-border)",
                  bgcolor: "rgba(255,255,255,0.44)",
                }}
              >
                <Typography variant="overline" sx={{ color: "var(--app-accent)" }}>
                  Today
                </Typography>
                <Typography
                  sx={{
                    color: "var(--app-text)",
                    fontWeight: 800,
                    fontSize: { xs: "1.65rem", md: "2rem" },
                    lineHeight: 1.02,
                    letterSpacing: "-0.04em",
                    mt: 0.25,
                  }}
                >
                  {mounted
                    ? now.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Loading date..."}
                </Typography>
                <Typography sx={{ color: "var(--app-text-muted)", mt: 0.6 }}>
                  {mounted
                    ? now.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : ""}
                </Typography>
              </Box>

              <Stack
                direction="row"
                spacing={1.25}
                sx={{
                  alignItems: "center",
                  p: { xs: 1.5, md: 1.75 },
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.44)",
                  border: "1px solid var(--app-border)",
                  minWidth: 0,
                }}
              >
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 3,
                    bgcolor: "rgba(225,29,72,0.12)",
                    color: "var(--app-accent)",
                    flexShrink: 0,
                  }}
                >
                  <CalendarMonthRounded />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: "var(--app-text)", fontWeight: 800 }}>
                    Reporting cadence
                  </Typography>
                  <Typography sx={{ color: "var(--app-text-muted)", fontSize: 14 }}>
                    Stay on top of approvals, downloads, and resubmissions.
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(3, minmax(0, 1fr))",
                  lg: "1fr",
                  xl: "repeat(3, minmax(0, 1fr))",
                },
                alignSelf: "stretch",
              }}
            >
              <Box
                sx={{
                  p: 1.35,
                  borderRadius: 3,
                  bgcolor: "rgba(225,29,72,0.08)",
                  border: "1px solid rgba(225,29,72,0.12)",
                }}
              >
                <Typography sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}>
                  Active user
                </Typography>
                <Typography sx={{ mt: 0.5, color: "var(--app-text)", fontWeight: 800 }}>
                  {user?.username || user?.email || "Workspace"}
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 1.35,
                  borderRadius: 3,
                  bgcolor: "rgba(37,99,235,0.08)",
                  border: "1px solid rgba(37,99,235,0.12)",
                }}
              >
                <Typography sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}>
                  Last 5 outputs
                </Typography>
                <Typography sx={{ mt: 0.5, color: "var(--app-text)", fontWeight: 800 }}>
                  {recent.length}
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 1.35,
                  borderRadius: 3,
                  bgcolor: "rgba(5,150,105,0.08)",
                  border: "1px solid rgba(5,150,105,0.12)",
                }}
              >
                <Typography sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}>
                  Total reports
                </Typography>
                <Typography sx={{ mt: 0.5, color: "var(--app-text)", fontWeight: 800 }}>
                  {statsLoading ? "..." : stats?.totalReports ?? 0}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Stack>
      </SurfaceCard>

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
        {moduleCards.map((card) => (
          <SurfaceCard
            key={card.key}
            sx={{
              p: 2.5,
              cursor: "pointer",
              transition: "transform 180ms ease, box-shadow 180ms ease",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: "var(--app-shadow-shell)",
              },
            }}
            onClick={() => {
              setDrawerType(card.key);
              setDrawerOpen(true);
            }}
          >
            <Stack spacing={2.25}>
              <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
                <AppIcon name={card.icon} accent={card.accent} />
                <ArrowForwardRounded sx={{ color: "var(--app-text-muted)" }} />
              </Stack>
              <Box>
                <Typography variant="h6" sx={{ color: "var(--app-text)" }}>
                  {card.title}
                </Typography>
                <Typography sx={{ mt: 0.8, color: "var(--app-text-muted)" }}>
                  {card.description}
                </Typography>
              </Box>
            </Stack>
          </SurfaceCard>
        ))}
      </Box>

      {statsError ? <Alert severity="error">{statsError}</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
          },
        }}
      >
        <MetricCard
          label="Total reports"
          value={statsLoading ? "..." : stats?.totalReports ?? 0}
          hint="Generated across all formats and approved report types."
          accent="#2563eb"
          icon={<TroubleshootRounded />}
        />
        <MetricCard
          label="Total portfolio value"
          value={
            statsLoading
              ? "..."
              : new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(stats?.totalFairMarketValue ?? 0)
          }
          hint="Aggregated fair market value from the current reporting dataset."
          accent="#059669"
          icon={<TrendingUpRounded />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.1fr 0.9fr",
          },
        }}
      >
        <SectionPanel
          title="Valuation method distribution"
          subtitle="Counts and value concentration across the major methods."
        >
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            <SurfaceCard sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ color: "var(--app-text)" }}>
                Report count mix
              </Typography>
              <Stack spacing={1.4} sx={{ mt: 2 }}>
                {Object.entries(stats?.breakdown?.counts || {}).map(([key, value]) => (
                  <Box key={key}>
                    <Stack
                      direction="row"
                      sx={{ mb: 0.8, justifyContent: "space-between", alignItems: "center" }}
                    >
                      <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                        {key}
                      </Typography>
                      <Typography sx={{ color: "var(--app-text-muted)" }}>
                        {value}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={
                        stats?.totalReports
                          ? Math.min((value / stats.totalReports) * 100, 100)
                          : 0
                      }
                      sx={{
                        height: 10,
                        borderRadius: 99,
                        bgcolor: "rgba(148, 163, 184, 0.16)",
                        "& .MuiLinearProgress-bar": {
                          backgroundColor: METHOD_COLORS[key] || "#2563eb",
                          borderRadius: 99,
                        },
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </SurfaceCard>

            <SurfaceCard sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ color: "var(--app-text)" }}>
                Value distribution
              </Typography>
              <Stack spacing={1.4} sx={{ mt: 2 }}>
                {Object.entries(stats?.breakdown?.values || {}).map(([key, value]) => (
                  <Stack
                    key={key}
                    direction="row"
                    sx={{
                      p: 1.4,
                      borderRadius: 3,
                      bgcolor: "rgba(148, 163, 184, 0.08)",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Avatar
                        sx={{
                          width: 12,
                          height: 12,
                          bgcolor: METHOD_COLORS[key] || "#2563eb",
                        }}
                      />
                      <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                        {key}
                      </Typography>
                    </Stack>
                    <Typography sx={{ color: "var(--app-text-muted)" }}>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(value)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </SurfaceCard>
          </Box>
        </SectionPanel>

        <SectionPanel
          title="Recent reports"
          subtitle="Latest output ready to revisit, download, or review."
          action={
            <Button
              size="small"
              endIcon={<ArrowForwardRounded />}
              onClick={() => router.push("/reports")}
            >
              Open reports
            </Button>
          }
        >
          <Stack spacing={1.5}>
            {recentLoading ? (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <CircularProgress size={18} />
                <Typography sx={{ color: "var(--app-text-muted)" }}>
                  Loading recent reports...
                </Typography>
              </Stack>
            ) : recentError ? (
              <Alert severity="error">{recentError}</Alert>
            ) : recent.length === 0 ? (
              <Typography sx={{ color: "var(--app-text-muted)" }}>
                No recent reports yet. Create your first report to populate this workspace.
              </Typography>
            ) : (
              recent.map((report) => (
                <SurfaceCard
                  key={report._id}
                  sx={{
                    p: 2,
                    cursor: "pointer",
                    "&:hover": { boxShadow: "var(--app-shadow-card)" },
                  }}
                  onClick={() => router.push("/reports")}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          color: "var(--app-text)",
                          fontWeight: 800,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {report.address}
                      </Typography>
                      <Typography sx={{ color: "var(--app-text-muted)", mt: 0.5 }}>
                        {mounted
                          ? new Date(report.createdAt).toLocaleDateString("en-US")
                          : "Loading..."}{" "}
                        {mounted ? `· ${timeAgo(new Date(report.createdAt))}` : ""}
                      </Typography>
                    </Box>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
                    >
                      {report.valuationMethods?.length ? (
                        report.valuationMethods.map((method, index) => (
                          <StatusPill
                            key={`${method.method}-${index}`}
                            label={`${method.method} ${new Intl.NumberFormat(
                              "en-US",
                              {
                                notation: "compact",
                                maximumFractionDigits: 1,
                              }
                            ).format(method.value)}`}
                            color="info"
                          />
                        ))
                      ) : (
                        <StatusPill
                          label={report.fairMarketValue || "No value"}
                          color="success"
                        />
                      )}
                      <Button size="small" endIcon={<ArrowForwardRounded />}>
                        View
                      </Button>
                    </Stack>
                  </Stack>
                </SurfaceCard>
              ))
            )}
          </Stack>
        </SectionPanel>
      </Box>

      <BottomDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerType ? DRAWER_TITLES[drawerType] : undefined}
      >
        {drawerType === "real-estate" ? (
          <RealEstateForm
            onSuccess={() => setDrawerOpen(false)}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : drawerType === "salvage" ? (
          <SalvageForm
            onSuccess={() => setDrawerOpen(false)}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : drawerType === "asset" ? (
          <AssetForm
            onSuccess={() => setDrawerOpen(false)}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : drawerType === "lot-listing" ? (
          <LotListingForm
            onSuccess={() => setDrawerOpen(false)}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </BottomDrawer>
    </Stack>
  );
}
