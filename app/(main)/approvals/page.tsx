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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { ReportsService, type AssignedApproval } from "@/services/reports";
import PreviewModal from "@/components/reports/PreviewModal";
import Loading from "@/components/common/Loading";
import { useAuthContext } from "@/context/AuthContext";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function reportTitle(item: AssignedApproval) {
  return item.address || item.filename || item.contract_no || "Assigned report";
}

export default function AssignedApprovalsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthContext();
  const [items, setItems] = useState<AssignedApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AssignedApproval | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AssignedApproval | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const pendingCount = useMemo(() => items.length, [items.length]);
  const canViewApprovals = Boolean(user?.isReportApprover);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await ReportsService.getAssignedApprovals();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assigned approvals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!canViewApprovals) {
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [authLoading, canViewApprovals, router]);

  if (authLoading || !canViewApprovals) {
    return (
      <Loading
        message={authLoading ? "Checking your account..." : "Redirecting to dashboard..."}
        height={120}
        width={120}
        className="min-h-[50vh]"
      />
    );
  }

  async function approve(item: AssignedApproval) {
    setBusyId(item._id);
    setError("");
    setSuccess("");
    try {
      await ReportsService.approveAssignedApproval(item._id);
      setSuccess("Report approved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve report");
    } finally {
      setBusyId("");
    }
  }

  async function reject() {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      setError("Rejection note is required.");
      return;
    }
    setBusyId(rejectTarget._id);
    setError("");
    setSuccess("");
    try {
      await ReportsService.rejectAssignedApproval(rejectTarget._id, rejectNote.trim());
      setSuccess("Report rejected.");
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject report");
    } finally {
      setBusyId("");
    }
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
            Assigned Approvals
          </Typography>
          <Typography sx={{ mt: 0.5, color: "text.secondary" }}>
            Review reports assigned to you without admin access.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
        <Chip color={pendingCount ? "warning" : "success"} label={`${pendingCount} pending`} />
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
              No assigned approvals
            </Typography>
            <Typography sx={{ mt: 1, color: "text.secondary" }}>
              Reports assigned to you will appear here.
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
                      <Chip size="small" variant="outlined" label="Pending" />
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
                    {item.isAssetReport ? (
                      <Button
                        variant="outlined"
                        startIcon={<EditRoundedIcon />}
                        disabled={busyId === item._id}
                        onClick={() => setReviewTarget(item)}
                      >
                        Review / Edit
                      </Button>
                    ) : null}
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleRoundedIcon />}
                      disabled={busyId === item._id}
                      onClick={() => void approve(item)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<CloseRoundedIcon />}
                      disabled={busyId === item._id}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectNote("");
                      }}
                    >
                      Reject
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={Boolean(rejectTarget)} onClose={() => (busyId ? undefined : setRejectTarget(null))} fullWidth maxWidth="sm">
        <DialogTitle>Reject report</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, color: "text.secondary" }}>
            Add a clear note so the report creator knows what to fix.
          </Typography>
          <TextField
            label="Rejection note"
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            multiline
            minRows={4}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)} disabled={Boolean(busyId)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={() => void reject()} disabled={Boolean(busyId) || !rejectNote.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
      {reviewTarget ? (
        <PreviewModal
          reportId={reviewTarget._id}
          isOpen={Boolean(reviewTarget)}
          onClose={() => setReviewTarget(null)}
          onSuccess={() => {
            setReviewTarget(null);
            void load();
          }}
          isResubmitMode
          loadPreviewDataOverride={ReportsService.getAssignedAssetPreview}
          updatePreviewDataOverride={ReportsService.updateAssignedAssetPreview}
          resubmitReportOverride={ReportsService.resubmitAssignedAssetPreview}
        />
      ) : null}
    </Box>
  );
}
