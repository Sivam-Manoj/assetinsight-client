"use client";

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
  onClose,
  children,
  fullscreen = false,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  fullscreen?: boolean;
}) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const mobileSheetHeight = "calc(100dvh - env(safe-area-inset-top) - 8px)";

  return (
    <Drawer
      anchor={desktop ? "right" : "bottom"}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      slotProps={{
        paper: {
          sx: {
            width: desktop ? (fullscreen ? "100vw" : "min(960px, 92vw)") : "100%",
            height: desktop ? "100%" : mobileSheetHeight,
            maxHeight: desktop ? "100dvh" : mobileSheetHeight,
            minHeight: desktop ? "100%" : "min(720px, 100dvh)",
            borderTopLeftRadius: desktop ? 0 : 18,
            borderTopRightRadius: desktop ? 0 : 18,
            borderLeft: desktop && !fullscreen ? "1px solid var(--app-border)" : undefined,
            borderTop: desktop ? undefined : "1px solid var(--app-border)",
            bgcolor: "var(--app-panel)",
            backgroundImage:
              fullscreen
                ? "linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 98%, transparent) 0%, color-mix(in srgb, var(--app-panel-alt) 94%, transparent) 100%)"
                : "radial-gradient(circle at top left, rgba(225,29,72,0.1), transparent 24%), radial-gradient(circle at bottom right, rgba(37,99,235,0.1), transparent 24%), linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, transparent) 0%, color-mix(in srgb, var(--app-panel-alt) 90%, transparent) 100%)",
            boxShadow: "var(--app-shadow-modal)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          sx={{
            px: { xs: 2, md: 3 },
            pt: { xs: 1.25, md: 2 },
            pb: 2,
            borderBottom: "1px solid var(--app-border)",
            position: "sticky",
            top: 0,
            zIndex: 2,
            bgcolor: "var(--app-panel-soft)",
            backdropFilter: "blur(18px)",
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
            spacing={2}
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
            {title ? (
              <Typography variant="h6" sx={{ color: "var(--app-text)" }}>
                {title}
              </Typography>
            ) : null}
            <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
              Review and update details in a focused workspace.
            </Typography>
            </Box>
            <IconButton
              onClick={onClose}
              sx={{
                border: "1px solid var(--app-border)",
                bgcolor: "var(--app-panel)",
                boxShadow: "var(--app-shadow-card)",
              }}
            >
              <CloseRounded />
            </IconButton>
          </Stack>
        </Stack>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            px: { xs: 2, md: 3 },
            pt: { xs: 2, md: 3 },
            pb: { xs: "calc(env(safe-area-inset-bottom) + 24px)", md: 3 },
          }}
        >
          {children}
        </Box>
      </Stack>
    </Drawer>
  );
}
