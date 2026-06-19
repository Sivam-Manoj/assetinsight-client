"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { ReportsService, type AssignedRelease } from "@/services/reports";
import Loading from "@/components/common/Loading";
import { useAuthContext } from "@/context/AuthContext";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function reportTitle(item: AssignedRelease) {
  return item.address || item.filename || item.contract_no || "Assigned report";
}

export default function AssignedReleasesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthContext();
  const [items, setItems] = useState<AssignedRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pendingCount = useMemo(() => items.length, [items.length]);
  const canViewReleases = Boolean(user?.isReleaseManager);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await ReportsService.getAssignedReleases();
      setItems(data.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load assigned releases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!canViewReleases) {
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [authLoading, canViewReleases, router]);

  async function release(item: AssignedRelease) {
    setBusyId(item._id);
    setError("");
    setSuccess("");
    try {
      await ReportsService.releaseAssignedReport(item._id);
      setSuccess("Report released. The creator can now download files.");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to release report");
    } finally {
      setBusyId("");
    }
  }

  if (authLoading || !canViewReleases) {
    return (
      <Loading
        message={authLoading ? "Checking your account..." : "Redirecting to dashboard..."}
        height={120}
        width={120}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1180, mx: "auto" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary" }}>
            Assigned Releases
          </Typography>
          <Typography sx={{ mt: 0.5, color: "text.secondary" }}>
            Release approved reports once payment or internal clearance is complete.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
        <Chip color={pendingCount ? "warning" : "success"} label={`${pendingCount} awaiting release`} />
      </Stack>

      {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert> : null}

      {loading ? (
        <Stack sx={{ py: 8, alignItems: "center" }}>
          <CircularProgress />
        </Stack>
      ) : items.length === 0 ? (
        <Card sx={{ mt: 3, borderRadius: 4 }}>
          <CardContent sx={{ py: 5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              No assigned releases
            </Typography>
            <Typography sx={{ mt: 1, color: "text.secondary" }}>
              Approved reports waiting for your release will appear here.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2} sx={{ mt: 3 }}>
          {items.map((item) => (
            <Card key={item._id} sx={{ borderRadius: 4, overflow: "hidden" }}>
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                      <Chip size="small" color="primary" label={item.reportType} />
                      <Chip size="small" color="warning" variant="outlined" label="Awaiting release" />
                    </Stack>
                    <Typography variant="h6" sx={{ mt: 1, wordBreak: "break-word", fontWeight: 900 }}>
                      {reportTitle(item)}
                    </Typography>
                    <Typography sx={{ mt: 0.5, color: "text.secondary" }}>
                      {item.contract_no ? `Contract ${item.contract_no} - ` : ""}
                      {item.fairMarketValue || "Value not set"}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
                      Submitted by {item.user?.username || item.user?.email || "User"} - {formatDate(item.createdAt)}
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<LockOpenRoundedIcon />}
                      disabled={busyId === item._id}
                      onClick={() => void release(item)}
                    >
                      {busyId === item._id ? "Releasing..." : "Release"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
