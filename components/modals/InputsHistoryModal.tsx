"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArticleRounded,
  CloseRounded,
  DeleteOutlineRounded,
  HistoryRounded,
} from "@mui/icons-material";
import {
  SavedInputService,
  type AssetFormData,
  type FormType,
  type RealEstateFormData,
  type SavedInput,
} from "@/services/savedInputs";
import { toast } from "react-toastify";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onLoadInput: (savedInput: SavedInput) => void;
  formType?: FormType;
};

export default function InputsHistoryModal({
  isOpen,
  onClose,
  onLoadInput,
  formType,
}: Props) {
  const router = useRouter();
  const [savedInputs, setSavedInputs] = useState<SavedInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchSavedInputs();
    }
  }, [isOpen, formType]);

  const fetchSavedInputs = async () => {
    try {
      setLoading(true);
      const inputs = await SavedInputService.getAll(formType);
      setSavedInputs(inputs);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to load drafts"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      setDeleting(id);
      await SavedInputService.delete(id);
      setSavedInputs((prev) => prev.filter((item) => item._id !== id));
      toast.success("Deleted successfully");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  const handleLoad = (savedInput: SavedInput) => {
    onLoadInput(savedInput);
    onClose();
    router.push("/dashboard");
    setTimeout(() => {
      const eventName =
        savedInput.formType === "realEstate"
          ? "load-realestate-input"
          : "load-saved-input";
      window.dispatchEvent(new CustomEvent(eventName, { detail: savedInput }));
    }, 300);
  };

  const totalLabel = useMemo(
    () => `${savedInputs.length} saved ${savedInputs.length === 1 ? "entry" : "entries"}`,
    [savedInputs.length]
  );

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const renderSummary = (item: SavedInput) => {
    const asset = item.formData as AssetFormData;
    const realEstate = item.formData as RealEstateFormData;
    return (
      <Stack spacing={0.5}>
        {asset.clientName ? (
          <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
            Client: {asset.clientName}
          </Typography>
        ) : null}
        {asset.contractNo ? (
          <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
            Contract: {asset.contractNo}
          </Typography>
        ) : null}
        {realEstate.property_details?.address ? (
          <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
            Address: {realEstate.property_details.address}
          </Typography>
        ) : null}
      </Stack>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 6,
            border: "1px solid var(--app-border)",
            bgcolor: "var(--app-panel)",
            backgroundImage:
              "radial-gradient(circle at top left, rgba(225,29,72,0.08), transparent 22%), radial-gradient(circle at bottom right, rgba(37,99,235,0.08), transparent 20%)",
            boxShadow: "var(--app-shadow-modal)",
          },
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 3, pb: 2 }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar
              variant="rounded"
              sx={{
                width: 48,
                height: 48,
                borderRadius: 4,
                bgcolor: "var(--app-accent-soft)",
                color: "var(--app-accent)",
              }}
            >
              <HistoryRounded />
            </Avatar>
            <Stack>
              <Typography variant="h6" sx={{ color: "var(--app-text)" }}>
                Drafts
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
                {totalLabel}
              </Typography>
            </Stack>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseRounded />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider sx={{ borderColor: "var(--app-border)" }} />
      <DialogContent sx={{ px: 2, py: 2.5 }}>
        {loading ? (
          <Typography sx={{ color: "var(--app-text-muted)", p: 2 }}>
            Loading saved drafts...
          </Typography>
        ) : savedInputs.length === 0 ? (
          <Stack spacing={1.5} sx={{ py: 8, alignItems: "center" }}>
            <Avatar
              variant="rounded"
              sx={{
                width: 64,
                height: 64,
                borderRadius: 5,
                bgcolor: "rgba(148, 163, 184, 0.12)",
                color: "var(--app-text-muted)",
              }}
            >
              <ArticleRounded />
            </Avatar>
            <Typography variant="h6" sx={{ color: "var(--app-text)" }}>
              No saved drafts yet
            </Typography>
            <Typography sx={{ color: "var(--app-text-muted)" }}>
              Drafts will appear here so you can resume work quickly.
            </Typography>
          </Stack>
        ) : (
          <List sx={{ p: 0 }}>
            {savedInputs.map((item, index) => (
              <ListItem
                key={item._id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    color="error"
                    onClick={() => handleDelete(item._id, item.name)}
                    disabled={deleting === item._id}
                  >
                    <DeleteOutlineRounded />
                  </IconButton>
                }
                sx={{
                  mb: index === savedInputs.length - 1 ? 0 : 1.25,
                  border: "1px solid var(--app-border)",
                  borderRadius: 4,
                  bgcolor: "var(--app-panel-soft)",
                }}
              >
                <ListItemButton
                  onClick={() => handleLoad(item)}
                  sx={{
                    borderRadius: 4,
                    py: 2,
                    pr: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
                      >
                        <Typography sx={{ fontWeight: 800, color: "var(--app-text)" }}>
                          {item.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 99,
                            bgcolor:
                              item.formType === "realEstate"
                                ? "rgba(5,150,105,0.12)"
                                : "rgba(37,99,235,0.12)",
                            color:
                              item.formType === "realEstate" ? "#059669" : "#2563eb",
                            fontWeight: 700,
                          }}
                        >
                          {item.formType === "realEstate" ? "Real Estate" : "Asset"}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack spacing={1.25} sx={{ mt: 1 }}>
                        {renderSummary(item)}
                        <Typography variant="caption" sx={{ color: "var(--app-text-muted)" }}>
                          Saved {formatDateTime(item.createdAt)}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <Divider sx={{ borderColor: "var(--app-border)" }} />
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ px: 3, py: 2, justifyContent: "flex-end" }}
      >
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </Stack>
    </Dialog>
  );
}
