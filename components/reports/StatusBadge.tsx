import React from "react";
import { Chip } from "@mui/material";
import {
  AccessTimeRounded,
  CheckCircleRounded,
  EditNoteRounded,
  ErrorOutlineRounded,
  HourglassTopRounded,
  VisibilityRounded,
} from "@mui/icons-material";

export type ReportStatus =
  | "draft"
  | "processing"
  | "preview"
  | "pending_approval"
  | "approved"
  | "declined"
  | "error";

interface StatusBadgeProps {
  status: ReportStatus;
  label?: string;
  className?: string;
}

const statusConfig = {
  draft: {
    label: "Draft",
    color: "default" as const,
    icon: <EditNoteRounded fontSize="small" />,
  },
  processing: {
    label: "Processing",
    color: "info" as const,
    icon: <HourglassTopRounded fontSize="small" />,
  },
  preview: {
    label: "Ready for Review",
    color: "info" as const,
    icon: <VisibilityRounded fontSize="small" />,
  },
  pending_approval: {
    label: "Awaiting Approval",
    color: "warning" as const,
    icon: <AccessTimeRounded fontSize="small" />,
  },
  approved: {
    label: "Approved",
    color: "success" as const,
    icon: <CheckCircleRounded fontSize="small" />,
  },
  declined: {
    label: "Declined",
    color: "error" as const,
    icon: <ErrorOutlineRounded fontSize="small" />,
  },
  error: {
    label: "Error",
    color: "error" as const,
    icon: <ErrorOutlineRounded fontSize="small" />,
  },
};

export default function StatusBadge({
  status,
  label,
  className = "",
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Chip
      icon={config.icon}
      label={label || config.label}
      color={config.color}
      className={className}
      size="small"
      sx={{ fontWeight: 700 }}
    />
  );
}
