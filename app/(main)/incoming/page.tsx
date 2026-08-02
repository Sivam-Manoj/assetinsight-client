"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import {
  AddPhotoAlternateRounded,
  AssignmentRounded,
  EventRounded,
  Inventory2Rounded,
  LocationOnRounded,
  LockRounded,
  PersonRounded,
  RefreshRounded,
  RestartAltRounded,
} from "@mui/icons-material";
import BottomDrawer from "@/components/BottomDrawer";
import Loading from "@/components/common/Loading";
import {
  EmptyState,
  PageHeader,
  StatusPill,
  SurfaceCard,
} from "@/components/common/WorkspaceUI";
import {
  DraftStatusIndicator,
  type DraftStatus,
} from "@/components/forms/ui/FormUI";
import { useAuthContext } from "@/context/AuthContext";
import AuctioneerService, {
  type AuctioneerIncomingItem,
  type AuctioneerReportType,
  type AuctioneerWorkItemSetup,
} from "@/services/auctioneer";

const AssetForm = dynamic(() => import("@/components/forms/AssetForm"), {
  ssr: false,
  loading: () => (
    <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}>
      <Loading message="Loading asset form..." height={140} width={140} />
    </Box>
  ),
});

const LotListingForm = dynamic(
  () => import("@/components/forms/LotListingForm"),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}>
        <Loading message="Loading lot listing form..." height={140} width={140} />
      </Box>
    ),
  }
);

function errorMessage(error: any, fallback: string) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

function displayDate(value?: string) {
  if (!value) return "Date not supplied";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(parsed);
}

function claimedByLabel(item: AuctioneerIncomingItem) {
  if (!item.claimedBy) return "";
  if (typeof item.claimedBy === "string") return "another user";
  return (
    item.claimedBy.name ||
    item.claimedBy.username ||
    item.claimedBy.email ||
    "another user"
  );
}

function statusFor(item: AuctioneerIncomingItem, isMine: boolean) {
  if (item.status === "sent") {
    return { label: "Sent", color: "success" as const };
  }
  if (item.status === "report_created") {
    return {
      label: isMine ? "Your report" : "Report created",
      color: "info" as const,
    };
  }
  if (item.status === "claimed") {
    return {
      label: isMine ? "Claimed by you" : "Claimed",
      color: isMine ? ("primary" as const) : ("warning" as const),
    };
  }
  return { label: "Available", color: "success" as const };
}

export default function IncomingPage() {
  const { user } = useAuthContext();
  const router = useRouter();
  const [items, setItems] = useState<AuctioneerIncomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(
    null
  );
  const [selected, setSelected] = useState<AuctioneerIncomingItem | null>(null);
  const [claiming, setClaiming] = useState<AuctioneerReportType | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [setup, setSetup] = useState<AuctioneerWorkItemSetup | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDraftStatus, setDrawerDraftStatus] = useState<{
    status: DraftStatus;
    label?: string;
  } | null>(null);
  const requestInFlightRef = useRef<Promise<void> | null>(null);

  const isItemMine = useCallback(
    (item: AuctioneerIncomingItem) => {
      if (item.claimedByMe) return true;
      const userId = user?._id || user?.id;
      if (!userId || !item.claimedBy) return false;
      if (typeof item.claimedBy === "string") {
        return item.claimedBy === userId;
      }
      return (item.claimedBy._id || item.claimedBy.id) === userId;
    },
    [user?._id, user?.id]
  );

  const refresh = useCallback(async (silent = false, force = false) => {
    if (requestInFlightRef.current) return requestInFlightRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);

    const request = (async () => {
      try {
        const [incomingResult, statusResult] = await Promise.allSettled([
          AuctioneerService.getIncoming(force),
          AuctioneerService.getStatus(),
        ]);
        if (statusResult.status === "fulfilled") {
          const status = statusResult.value;
          const warning = !status.enabled
            ? "The Auctioneer integration is disabled on the server."
            : !status.configured
              ? "Auctioneer is not configured on the server."
              : status.reachable === false
                ? status.message || "Auctioneer is temporarily unreachable."
                : null;
          setConnectionWarning(warning);
          if (!status.enabled || !status.configured) {
            setItems([]);
            setError(null);
            return;
          }
        }
        if (incomingResult.status === "rejected") throw incomingResult.reason;
        setItems(incomingResult.value);
        setError(null);
      } catch (loadError) {
        setError(errorMessage(loadError, "Unable to load incoming contracts."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })().finally(() => {
      requestInFlightRef.current = null;
    });

    requestInFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const availableCount = useMemo(
    () => items.filter((item) => item.status === "available").length,
    [items]
  );
  const myCount = useMemo(
    () => items.filter((item) => isItemMine(item)).length,
    [isItemMine, items]
  );

  const openSetup = useCallback(
    async (item: AuctioneerIncomingItem) => {
      if (!item.workItemId) return;
      setError(null);
      setClaiming(item.selectedReportType || "asset");
      try {
        const next = await AuctioneerService.getSetup(item.workItemId);
        setSetup(next);
        setDrawerDraftStatus(null);
        setDrawerOpen(true);
      } catch (setupError) {
        setError(
          errorMessage(setupError, "Unable to resume this incoming contract.")
        );
      } finally {
        setClaiming(null);
      }
    },
    []
  );

  const handleCardAction = useCallback(
    (item: AuctioneerIncomingItem) => {
      const mine = isItemMine(item);
      if (
        mine &&
        (item.status === "report_created" || item.status === "sent")
      ) {
        router.push("/reports");
        return;
      }
      if (mine && item.workItemId) {
        void openSetup(item);
        return;
      }
      if (item.status !== "available") return;
      setSelected(item);
    },
    [isItemMine, openSetup, router]
  );

  const claim = useCallback(
    async (reportType: AuctioneerReportType) => {
      if (!selected || claiming) return;
      setClaiming(reportType);
      setError(null);
      try {
        const claimed = await AuctioneerService.claim(
          selected.cycleKey,
          reportType
        );
        setSelected(null);
        setSetup(claimed);
        setDrawerDraftStatus(null);
        setDrawerOpen(true);
        await refresh(true);
      } catch (claimError) {
        setError(
          errorMessage(
            claimError,
            "This contract could not be claimed. Refresh and try again."
          )
        );
        await refresh(true);
      } finally {
        setClaiming(null);
      }
    },
    [claiming, refresh, selected]
  );

  const releaseClaim = useCallback(
    async (item: AuctioneerIncomingItem) => {
      if (!item.workItemId || releasingId) return;
      setReleasingId(item.workItemId);
      setError(null);
      try {
        await AuctioneerService.releaseClaim(item.workItemId);
        await refresh(true);
      } catch (releaseError) {
        setError(
          errorMessage(
            releaseError,
            "The claim could not be released. It may already have a report."
          )
        );
      } finally {
        setReleasingId(null);
      }
    },
    [refresh, releasingId]
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerDraftStatus(null);
    void refresh(true);
  }, [refresh]);

  if (loading) {
    return (
      <Loading
        message="Loading incoming Auctioneer contracts..."
        height={180}
        width={180}
        className="min-h-[60vh]"
      />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Auctioneer 2.0"
        title="Incoming"
        description="Claim an incoming contract, select the report workflow, and add the photos needed to generate an Asset Insight report."
        action={
          <Button
            variant="outlined"
            startIcon={
              refreshing ? <CircularProgress size={16} /> : <RefreshRounded />
            }
            disabled={refreshing}
            onClick={() => void refresh(true, true)}
          >
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {connectionWarning ? (
        <Alert severity="warning">{connectionWarning}</Alert>
      ) : null}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { xs: "stretch", sm: "center" } }}
      >
        <StatusPill
          label={`${availableCount} available`}
          color={availableCount ? "success" : "default"}
        />
        <StatusPill
          label={`${myCount} claimed by you`}
          color={myCount ? "primary" : "default"}
        />
        <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
          Refreshes automatically every 30 seconds.
        </Typography>
      </Stack>

      {items.length === 0 ? (
        <EmptyState
          title="No incoming contracts"
          description="Auctioneer has no pending contract batches for Asset Insight right now."
          action={
            <Button
              variant="contained"
              startIcon={<RefreshRounded />}
              onClick={() => void refresh(true, true)}
            >
              Check again
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              lg: "repeat(2, minmax(0, 1fr))",
            },
          }}
        >
          {items.map((item) => {
            const mine = isItemMine(item);
            const status = statusFor(item, mine);
            const blocked = item.status !== "available" && !mine;
            const canRelease =
              mine &&
              item.status === "claimed" &&
              Boolean(item.workItemId);
            return (
              <SurfaceCard
                key={item.cycleKey}
                sx={{
                  p: { xs: 2.25, md: 2.75 },
                  opacity: blocked ? 0.72 : 1,
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": blocked
                    ? undefined
                    : {
                        transform: "translateY(-2px)",
                        boxShadow: "var(--app-shadow-shell)",
                      },
                }}
              >
                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="overline"
                        sx={{
                          color: "var(--app-accent)",
                          fontWeight: 800,
                          letterSpacing: "0.12em",
                        }}
                      >
                        Contract
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          color: "var(--app-text)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.contractNo || "Contract number unavailable"}
                      </Typography>
                    </Box>
                    <StatusPill label={status.label} color={status.color} />
                  </Stack>

                  <Divider sx={{ borderColor: "var(--app-border)" }} />

                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.3,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                      <PersonRounded
                        fontSize="small"
                        sx={{ color: "var(--app-text-muted)", mt: 0.2 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
                          Customer
                        </Typography>
                        <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                          {item.customerName || "Not supplied"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                      <EventRounded
                        fontSize="small"
                        sx={{ color: "var(--app-text-muted)", mt: 0.2 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
                          Event
                        </Typography>
                        <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                          {item.eventTitle || "Not supplied"} · {displayDate(item.eventDate)}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                      <LocationOnRounded
                        fontSize="small"
                        sx={{ color: "var(--app-text-muted)", mt: 0.2 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
                          Location
                        </Typography>
                        <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                          {item.location || "Not supplied"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                      <Inventory2Rounded
                        fontSize="small"
                        sx={{ color: "var(--app-text-muted)", mt: 0.2 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
                          Incoming lots
                        </Typography>
                        <Typography sx={{ color: "var(--app-text)", fontWeight: 700 }}>
                          {item.lotCount} ·{" "}
                          {item.kind === "scheduleA" ? "Schedule A" : "Unknown lots"}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  {blocked ? (
                    <Alert severity="info" icon={<LockRounded />}>
                      Claimed by {claimedByLabel(item)}.
                    </Alert>
                  ) : null}

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "flex-end" }}
                  >
                    {canRelease ? (
                      <Button
                        color="inherit"
                        startIcon={<RestartAltRounded />}
                        disabled={releasingId === item.workItemId}
                        onClick={() => void releaseClaim(item)}
                      >
                        Release claim
                      </Button>
                    ) : null}
                    <Button
                      variant="contained"
                      startIcon={
                        mine ? <AssignmentRounded /> : <AddPhotoAlternateRounded />
                      }
                      disabled={blocked || claiming !== null}
                      onClick={() => handleCardAction(item)}
                    >
                      {mine && item.status === "report_created"
                        ? "Open My Reports"
                        : mine && item.status === "sent"
                          ? "View sent report"
                          : mine
                            ? "Resume report"
                            : "Create report"}
                    </Button>
                  </Stack>
                </Stack>
              </SurfaceCard>
            );
          })}
        </Box>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => (claiming ? undefined : setSelected(null))}
        fullWidth
        maxWidth="sm"
        aria-labelledby="incoming-report-type-title"
      >
        <DialogTitle id="incoming-report-type-title">
          Select report type
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "var(--app-text-muted)", mb: 2 }}>
            {selected?.contractNo} will be claimed by you and can create one
            report.
          </Typography>
          <Stack spacing={1.5}>
            <Button
              variant="outlined"
              size="large"
              startIcon={<AssignmentRounded />}
              disabled={claiming !== null}
              onClick={() => void claim("asset")}
              sx={{ justifyContent: "flex-start", py: 1.6 }}
            >
              {claiming === "asset" ? "Claiming..." : "Asset Listing"}
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<Inventory2Rounded />}
              disabled={claiming !== null}
              onClick={() => void claim("lotListing")}
              sx={{ justifyContent: "flex-start", py: 1.6 }}
            >
              {claiming === "lotListing" ? "Claiming..." : "Lot Listing"}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={claiming !== null} onClick={() => setSelected(null)}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <BottomDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={
          setup?.reportType === "lotListing"
            ? `Lot Listing · ${setup.contract.contractNo}`
            : `Asset Listing · ${setup?.contract.contractNo || ""}`
        }
        description={
          setup
            ? `${setup.kind === "scheduleA" ? "Schedule A mappings are locked" : "Unknown lots can be edited"} · imported from Auctioneer 2.0`
            : undefined
        }
        headerStatus={
          drawerDraftStatus ? (
            <DraftStatusIndicator
              status={drawerDraftStatus.status}
              label={drawerDraftStatus.label}
            />
          ) : undefined
        }
        contentScrollable={false}
      >
        {setup && setup.reportType === "asset" ? (
          <AssetForm
            key={`${setup.workItemId}:asset`}
            auctioneer={setup}
            onSuccess={closeDrawer}
            onCancel={closeDrawer}
            onDraftStatusChange={(status, label) =>
              setDrawerDraftStatus({ status, label })
            }
          />
        ) : setup && setup.reportType === "lotListing" ? (
          <LotListingForm
            key={`${setup.workItemId}:lotListing`}
            auctioneer={setup}
            onSuccess={closeDrawer}
            onCancel={closeDrawer}
            onDraftStatusChange={(status, label) =>
              setDrawerDraftStatus({ status, label })
            }
          />
        ) : null}
      </BottomDrawer>
    </Stack>
  );
}
