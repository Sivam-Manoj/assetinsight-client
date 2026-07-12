"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Radio,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CloseRounded, MergeRounded } from "@mui/icons-material";
import { toast } from "react-toastify";
import {
  getAssetMergeCandidates,
  mergeAssetReports,
  type AssetMergeCandidate,
  type AssetMergeResult,
} from "@/services/assets";

type Props = {
  open: boolean;
  anchorReportId: string | null;
  onClose: () => void;
  onCreated: (result: AssetMergeResult) => void;
};

const MAX_MERGE_SOURCES = 20;

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `merge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AssetMergeDialog({ open, anchorReportId, onClose, onCreated }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [candidates, setCandidates] = useState<AssetMergeCandidate[]>([]);
  const [contractNo, setContractNo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef("");

  useEffect(() => {
    if (!open || !anchorReportId) return;
    let active = true;
    const requestStorageKey = `asset-merge-request:${anchorReportId}`;
    const retainedRequestId = window.localStorage.getItem(requestStorageKey);
    requestIdRef.current = retainedRequestId || createRequestId();
    if (!retainedRequestId) {
      window.localStorage.setItem(requestStorageKey, requestIdRef.current);
    }
    setLoading(true);
    setError(null);
    setCandidates([]);
    setSelectedIds([]);
    setPrimaryId("");
    void getAssetMergeCandidates(anchorReportId)
      .then((response) => {
        if (!active) return;
        setContractNo(response.contractNo);
        setCandidates(response.candidates);
        const anchor = response.candidates.find(
          (candidate) => candidate.id === anchorReportId && candidate.eligible
        );
        if (anchor) {
          setSelectedIds([anchor.id]);
          setPrimaryId(anchor.id);
        }
      })
      .catch((requestError: any) => {
        if (!active) return;
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            "Unable to load matching Asset reports."
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [anchorReportId, open]);

  const selected = useMemo(
    () => candidates.filter((candidate) => selectedIds.includes(candidate.id)),
    [candidates, selectedIds]
  );
  const eligibleCount = useMemo(
    () => candidates.filter((candidate) => candidate.eligible).length,
    [candidates]
  );
  const duplicateLotNumbers = useMemo(() => {
    const counts = new Map<string, { value: string; count: number }>();
    selected.forEach((candidate) =>
      candidate.lotNumbers.forEach((value) => {
        const key = value.trim().toLowerCase();
        if (!key) return;
        const current = counts.get(key) || { value, count: 0 };
        current.count += 1;
        counts.set(key, current);
      })
    );
    return Array.from(counts.values()).filter((entry) => entry.count > 1);
  }, [selected]);
  const totals = useMemo(
    () => ({
      reports: selected.length,
      lots: selected.reduce((sum, candidate) => sum + candidate.lotCount, 0),
      images: selected.reduce((sum, candidate) => sum + candidate.imageCount, 0),
    }),
    [selected]
  );

  const toggleCandidate = (candidate: AssetMergeCandidate) => {
    if (!candidate.eligible) return;
    if (!selectedIds.includes(candidate.id) && selectedIds.length >= MAX_MERGE_SOURCES) {
      setError(`Select no more than ${MAX_MERGE_SOURCES} Asset reports.`);
      return;
    }
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(candidate.id)) {
        const next = current.filter((id) => id !== candidate.id);
        if (primaryId === candidate.id) setPrimaryId(next[0] || "");
        return next;
      }
      const next = [...current, candidate.id];
      if (!primaryId) setPrimaryId(candidate.id);
      return next;
    });
  };

  const submit = async () => {
    if (selectedIds.length < 2 || !primaryId) return;
    try {
      setSubmitting(true);
      setError(null);
      const result = await mergeAssetReports({
        sourceReportIds: selectedIds,
        primaryReportId: primaryId,
        mergeRequestId: requestIdRef.current,
      });
      if (anchorReportId) {
        window.localStorage.removeItem(`asset-merge-request:${anchorReportId}`);
      }
      toast.success(
        result.merge_conflicts.length > 0
          ? "Merged preview created. Resolve duplicate lot numbers before submitting."
          : "Merged Asset preview created."
      );
      onCreated(result);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to merge Asset reports."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: { borderRadius: fullScreen ? 0 : 2, minHeight: fullScreen ? "100%" : 620 },
        },
      }}
    >
      <DialogTitle sx={{ pr: 7 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 900 }}>
          Merge Asset Reports
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          Contract {contractNo || "-"}. Source reports remain unchanged.
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} disabled={submitting} sx={{ position: "absolute", right: 14, top: 14 }}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        {loading ? (
          <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 1,
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
              }}
            >
              {[
                ["Reports", totals.reports],
                ["Lots", totals.lots],
                ["Images", totals.images],
              ].map(([label, value]) => (
                <Box key={label} sx={{ textAlign: "center" }}>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Box>
              ))}
            </Box>
            {duplicateLotNumbers.length > 0 ? (
              <Alert severity="warning">
                Duplicate lot numbers {duplicateLotNumbers.map((entry) => entry.value).join(", ")} will be flagged in the merged preview and must be changed before submission.
              </Alert>
            ) : null}
            {eligibleCount < 2 ? (
              <Alert severity="info">No other eligible Asset reports use this exact contract number.</Alert>
            ) : null}
            <Stack spacing={1.25}>
              {candidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.id);
                return (
                  <Box
                    key={candidate.id}
                    onClick={() => toggleCandidate(candidate)}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "auto auto minmax(0, 1fr)",
                      gap: 1.25,
                      alignItems: "center",
                      p: 1.5,
                      border: "1px solid",
                      borderColor: checked ? "primary.main" : "divider",
                      bgcolor: checked ? "action.selected" : "background.paper",
                      borderRadius: 1.5,
                      cursor: candidate.eligible ? "pointer" : "not-allowed",
                      opacity: candidate.eligible ? 1 : 0.58,
                    }}
                  >
                    <Checkbox checked={checked} disabled={!candidate.eligible} tabIndex={-1} />
                    <Radio
                      checked={primaryId === candidate.id}
                      disabled={!checked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => setPrimaryId(candidate.id)}
                      aria-label={`Use ${candidate.clientName} as primary report`}
                    />
                    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: "center" }}>
                      <Avatar
                        src={candidate.thumbnailUrl}
                        variant="rounded"
                        sx={{ width: 64, height: 52, borderRadius: 1, bgcolor: "action.hover" }}
                      >
                        <MergeRounded />
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          <Typography sx={{ fontWeight: 800 }}>{candidate.clientName}</Typography>
                          <Chip size="small" label={formatStatus(candidate.status)} />
                          {candidate.isMergedReport ? <Chip size="small" color="info" label="Merged" /> : null}
                          {primaryId === candidate.id ? <Chip size="small" color="primary" label="Primary" /> : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {new Date(candidate.createdAt).toLocaleDateString()} · {candidate.lotCount} lots · {candidate.imageCount} images
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {candidate.lotNumbers.length ? candidate.lotNumbers.map((value) => `Lot ${value}`).join(", ") : "No lot numbers"}
                        </Typography>
                        {!candidate.eligible ? (
                          <Typography variant="caption" color="error.main" sx={{ display: "block" }}>
                            {candidate.disabledReason}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
            <FormControlLabel
              control={<Radio checked={Boolean(primaryId)} disabled />}
              label="The Primary report supplies shared client, appraisal, date, location, signature, and report settings."
            />
          </Stack>
        )}
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <MergeRounded />}
          disabled={loading || submitting || selectedIds.length < 2 || !primaryId}
          onClick={() => void submit()}
        >
          {submitting ? "Creating merged preview..." : "Create merged preview"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
