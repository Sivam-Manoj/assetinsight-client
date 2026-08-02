"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import AuctioneerService, {
  type AuctioneerDeliverySummary,
  type AuctioneerSendDeliveryInput,
} from "@/services/auctioneer";

export type AuctioneerDeliveryDialogProps = {
  open: boolean;
  delivery: AuctioneerDeliverySummary | null;
  onClose: () => void;
  onUpdated: (delivery: AuctioneerDeliverySummary) => void;
};

function errorMessage(error: any, fallback: string) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

export default function AuctioneerDeliveryDialog({
  open,
  delivery,
  onClose,
  onUpdated,
}: AuctioneerDeliveryDialogProps) {
  const [destination, setDestination] =
    useState<AuctioneerSendDeliveryInput["destination"]>("LottingBoard");
  const [opTaskDescription, setOpTaskDescription] = useState("");
  const [completeContract, setCompleteContract] = useState(false);
  const [externalLotId, setExternalLotId] = useState("");
  const [confirmNotCreated, setConfirmNotCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !delivery) return;
    setDestination(delivery.destination || "LottingBoard");
    setOpTaskDescription(delivery.opTaskDescription || "");
    setCompleteContract(Boolean(delivery.completeContract));
    setExternalLotId("");
    setConfirmNotCreated(false);
    setError(null);
  }, [delivery, open]);

  const needsReconciliation = delivery?.state === "needs_reconciliation";
  const terminal = delivery?.state === "sent";
  const retrying = delivery?.state === "failed";

  const handleSend = async () => {
    if (!delivery || busy) return;
    if (destination === "OpToDoBoard" && !opTaskDescription.trim()) {
      setError("Add an Operations To-Do note before sending.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const updated = await AuctioneerService.sendDelivery(delivery.workItemId, {
        destination,
        ...(destination === "OpToDoBoard"
          ? { opTaskDescription: opTaskDescription.trim() }
          : {}),
        completeContract,
      });
      onUpdated(updated);
      toast.success(
        updated.state === "sent"
          ? "Report sent to Auctioneer."
          : "Auctioneer delivery queued."
      );
      onClose();
    } catch (sendError: any) {
      setError(errorMessage(sendError, "Unable to queue the Auctioneer delivery."));
    } finally {
      setBusy(false);
    }
  };

  const handleReconcile = async () => {
    if (!delivery || busy) return;
    const lotId = externalLotId.trim();
    if (!lotId && !confirmNotCreated) {
      setError(
        "Enter the Auctioneer lot ID that was created, or confirm that no lot was created."
      );
      return;
    }
    if (lotId && confirmNotCreated) {
      setError("Choose one reconciliation option.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const updated = await AuctioneerService.reconcileDelivery(
        delivery.workItemId,
        lotId ? { externalLotId: lotId } : { confirmNotCreated: true }
      );
      onUpdated(updated);
      toast.success("Delivery reconciliation saved.");
      onClose();
    } catch (reconcileError: any) {
      setError(
        errorMessage(reconcileError, "Unable to reconcile this Auctioneer lot.")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="auctioneer-delivery-title"
    >
      <DialogTitle id="auctioneer-delivery-title">
        {needsReconciliation ? "Reconcile Auctioneer lot" : "Send to Auctioneer"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.75 }}>
          <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
            Contract {delivery?.contractNo || "report"} will send approved structured
            data and final report photos. Generated report files remain in Asset
            Insight.
          </Typography>

          {delivery?.error ? (
            <Alert severity={needsReconciliation ? "warning" : "error"}>
              {delivery.error}
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {retrying ? (
            <Alert severity="info">
              Retry resumes the saved lot checkpoints using the original
              destination and contract-completion settings.
            </Alert>
          ) : null}

          {needsReconciliation ? (
            <>
              <Alert severity="warning">
                Auctioneer may have created the Unknown Lot before the connection
                failed. Automatic retry is paused to prevent a duplicate.
              </Alert>
              <TextField
                label="Existing Auctioneer lot ID"
                value={externalLotId}
                onChange={(event) => {
                  setExternalLotId(event.target.value);
                  if (event.target.value.trim()) setConfirmNotCreated(false);
                }}
                disabled={busy || confirmNotCreated}
                fullWidth
                helperText="Use this when the lot exists in Auctioneer."
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={confirmNotCreated}
                    onChange={(event) => {
                      setConfirmNotCreated(event.target.checked);
                      if (event.target.checked) setExternalLotId("");
                    }}
                    disabled={busy}
                  />
                }
                label="I verified that Auctioneer did not create this lot"
              />
            </>
          ) : (
            <>
              <TextField
                select
                label="Destination"
                value={destination}
                onChange={(event) =>
                  setDestination(
                    event.target.value as AuctioneerSendDeliveryInput["destination"]
                  )
                }
                disabled={busy || terminal || retrying}
                fullWidth
              >
                <MenuItem value="LottingBoard">Lotting Board</MenuItem>
                <MenuItem value="OpToDoBoard">Operations To-Do Board</MenuItem>
              </TextField>
              {destination === "OpToDoBoard" ? (
                <TextField
                  label="Operations To-Do note"
                  value={opTaskDescription}
                  onChange={(event) => setOpTaskDescription(event.target.value)}
                  disabled={busy || terminal || retrying}
                  required
                  multiline
                  minRows={3}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  helperText={`${opTaskDescription.length}/2000`}
                />
              ) : null}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={completeContract}
                    onChange={(event) => setCompleteContract(event.target.checked)}
                    disabled={busy || terminal || retrying}
                  />
                }
                label="Mark the contract task complete after every linked lot succeeds"
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy}>
          {terminal ? "Close" : "Cancel"}
        </Button>
        {needsReconciliation ? (
          <Button variant="contained" onClick={handleReconcile} disabled={busy}>
            {busy ? "Saving..." : "Save reconciliation"}
          </Button>
        ) : terminal ? null : (
          <Button variant="contained" onClick={handleSend} disabled={busy}>
            {busy
              ? "Queuing..."
              : delivery?.state === "failed"
                ? "Retry delivery"
                : "Send report"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
