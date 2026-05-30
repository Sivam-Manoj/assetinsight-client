"use client";

import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  type PaperProps,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import {
  ArrowForwardRounded,
  InsertDriveFileRounded,
} from "@mui/icons-material";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 6,
        border: "1px solid var(--app-border)",
        bgcolor: "var(--app-panel-soft)",
        backdropFilter: "blur(18px)",
        p: { xs: 3, md: 4 },
        boxShadow: "var(--app-shadow-card)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top left, rgba(225,29,72,0.14), transparent 32%), radial-gradient(circle at bottom right, rgba(37,99,235,0.12), transparent 28%)",
          pointerEvents: "none",
        }}
      />
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{
          position: "relative",
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          {eyebrow ? (
            <Chip
              label={eyebrow}
              size="small"
              sx={{
                mb: 1.5,
                bgcolor: "var(--app-accent-soft)",
                color: "var(--app-accent)",
                fontWeight: 700,
              }}
            />
          ) : null}
          <Typography variant="h3" sx={{ color: "var(--app-text)" }}>
            {title}
          </Typography>
          {description ? (
            <Typography
              sx={{
                mt: 1,
                maxWidth: 780,
                color: "var(--app-text-muted)",
              }}
            >
              {description}
            </Typography>
          ) : null}
        </Box>
        {action ? (
          <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
            {action}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function SurfaceCard({
  children,
  sx,
  ...paperProps
}: {
  children: React.ReactNode;
  sx?: PaperProps["sx"];
} & Omit<PaperProps, "children" | "sx">) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 5,
        border: "1px solid var(--app-border)",
        bgcolor: "var(--app-panel-soft)",
        backdropFilter: "blur(16px)",
        boxShadow: "var(--app-shadow-card)",
        ...sx,
      }}
      {...paperProps}
    >
      {children}
    </Paper>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
      }}
    >
      <Box>
        <Typography variant="h6" sx={{ color: "var(--app-text)" }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action}
    </Stack>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <SurfaceCard
      sx={{
        p: 3,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          right: -40,
          top: -40,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha(accent, 0.2)} 0%, transparent 68%)`,
        }}
      />
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            variant="body2"
            sx={{ color: "var(--app-text-muted)", fontWeight: 700 }}
          >
            {label}
          </Typography>
          <Typography
            variant="h4"
            sx={{ mt: 1, color: "var(--app-text)", fontWeight: 800 }}
          >
            {value}
          </Typography>
          {hint ? (
            <Typography
              variant="body2"
              sx={{ mt: 1.2, color: "var(--app-text-muted)" }}
            >
              {hint}
            </Typography>
          ) : null}
        </Box>
        <Avatar
          variant="rounded"
          sx={{
            bgcolor: alpha(accent, 0.14),
            color: accent,
            width: 52,
            height: 52,
            borderRadius: 4,
            border: `1px solid ${alpha(accent, 0.16)}`,
          }}
        >
          {icon}
        </Avatar>
      </Stack>
    </SurfaceCard>
  );
}

export function StatusPill({
  label,
  color,
}: {
  label: string;
  color:
    | "default"
    | "primary"
    | "secondary"
    | "error"
    | "info"
    | "success"
    | "warning";
}) {
  return <Chip label={label} color={color} size="small" />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <SurfaceCard
      sx={{
        p: { xs: 4, md: 5 },
        textAlign: "center",
      }}
    >
      <Avatar
        variant="rounded"
        sx={{
          mx: "auto",
          width: 64,
          height: 64,
          borderRadius: 5,
          bgcolor: "var(--app-accent-soft)",
          color: "var(--app-accent)",
        }}
      >
        <InsertDriveFileRounded />
      </Avatar>
      <Typography variant="h6" sx={{ mt: 2.5, color: "var(--app-text)" }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 1, color: "var(--app-text-muted)" }}>
        {description}
      </Typography>
      {action ? <Box sx={{ mt: 3 }}>{action}</Box> : null}
    </SurfaceCard>
  );
}

export function SectionPanel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard sx={{ p: { xs: 2.5, md: 3 } }}>
      <SectionTitle title={title} subtitle={subtitle} action={action} />
      <Divider sx={{ my: 2.5, borderColor: "var(--app-border)" }} />
      {children}
    </SurfaceCard>
  );
}

export function InlineAction({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      endIcon={<ArrowForwardRounded />}
      sx={{ px: 0, minWidth: 0 }}
    >
      {label}
    </Button>
  );
}
