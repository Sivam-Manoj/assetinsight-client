"use client";

import { useId } from "react";
import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CloseRounded } from "@mui/icons-material";

export default function BottomDrawer({
  open,
  title,
  description = "Review and update details in a focused workspace.",
  headerStatus,
  onClose,
  children,
  fullscreen = false,
  contentScrollable = true,
}: {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerStatus?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  fullscreen?: boolean;
  contentScrollable?: boolean;
}) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const mobileSheetHeight = "calc(100dvh - env(safe-area-inset-top) - 8px)";
  const generatedId = useId();
  const titleId = title ? `drawer-title-${generatedId}` : undefined;
  const descriptionId = description
    ? `drawer-description-${generatedId}`
    : undefined;

  return (
    <Drawer
      anchor={desktop ? "right" : "bottom"}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      slotProps={{
        paper: {
          "aria-labelledby": titleId,
          "aria-describedby": descriptionId,
          sx: {
            width: desktop ? (fullscreen ? "100vw" : "min(960px, 92vw)") : "100%",
            height: desktop ? "100%" : mobileSheetHeight,
            maxHeight: desktop ? "100dvh" : mobileSheetHeight,
            minHeight: desktop ? "100%" : mobileSheetHeight,
            borderTopLeftRadius: desktop ? 0 : 24,
            borderTopRightRadius: desktop ? 0 : 24,
            borderLeft: desktop && !fullscreen ? "1px solid var(--app-border)" : undefined,
            borderTop: desktop ? undefined : "1px solid var(--app-border)",
            bgcolor: "var(--app-panel)",
            backgroundImage: "none",
            boxShadow: "var(--app-shadow-modal)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0, bgcolor: "var(--app-panel)" }}>
        <Stack
          sx={{
            px: { xs: 2, md: 3 },
            pt: { xs: 1.25, md: 2 },
            pb: 2,
            borderBottom: "1px solid var(--app-border)",
            flexShrink: 0,
            zIndex: 2,
            bgcolor: "var(--app-panel)",
          }}
        >
          {!desktop ? (
            <Box
              sx={{
                width: 44,
                height: 4,
                borderRadius: 999,
                bgcolor: "rgba(148, 163, 184, 0.35)",
                mx: "auto",
                mb: 1.5,
              }}
            />
          ) : null}
          <Stack
            direction="row"
            spacing={{ xs: 1.5, sm: 2 }}
            sx={{
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {title ? (
                <Typography
                  id={titleId}
                  component="h2"
                  variant="h6"
                  sx={{
                    color: "var(--app-text)",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.35,
                  }}
                >
                  {title}
                </Typography>
              ) : null}
              {description ? (
                <Typography
                  id={descriptionId}
                  component="div"
                  variant="body2"
                  sx={{ mt: title ? 0.35 : 0, color: "var(--app-text-muted)" }}
                >
                  {description}
                </Typography>
              ) : null}
              {!desktop && headerStatus ? (
                <Box sx={{ mt: 0.75, display: "flex", alignItems: "center" }}>
                  {headerStatus}
                </Box>
              ) : null}
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              {desktop && headerStatus ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 44,
                    pr: 1.5,
                    borderRight: "1px solid var(--app-border)",
                  }}
                >
                  {headerStatus}
                </Box>
              ) : null}
              <IconButton
                onClick={onClose}
                aria-label="Close drawer"
                sx={{
                  width: 44,
                  height: 44,
                  border: "1px solid var(--app-control-border, var(--app-border))",
                  borderRadius: "10px",
                  color: "var(--app-text)",
                  bgcolor: "var(--app-panel)",
                  "&:hover": { bgcolor: "var(--app-panel-alt)" },
                  "&:focus-visible": {
                    outline: "none",
                    boxShadow: "0 0 0 4px var(--app-accent-ring, var(--app-accent-soft))",
                  },
                }}
              >
                <CloseRounded />
              </IconButton>
            </Stack>
          </Stack>
        </Stack>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: contentScrollable ? "block" : "flex",
            flexDirection: contentScrollable ? undefined : "column",
            overflowY: contentScrollable ? "auto" : "hidden",
            overflowX: "hidden",
            px: contentScrollable ? { xs: 2, md: 3 } : 0,
            pt: contentScrollable ? { xs: 2, md: 3 } : 0,
            pb: contentScrollable
              ? { xs: "calc(env(safe-area-inset-bottom) + 24px)", md: 3 }
              : 0,
          }}
        >
          {children}
        </Box>
      </Stack>
    </Drawer>
  );
}
