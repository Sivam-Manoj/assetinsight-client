import {
  BarChart3,
  BellRing,
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";

export const navItems = ["Workflow", "Controls", "Security"];

export const heroMetrics = [
  { value: "4", label: "report tracks" },
  { value: "42", label: "lots in queue" },
  { value: "82%", label: "review cadence" },
];

export const workflowLanes = [
  {
    label: "Valuation intake",
    status: "Active",
    value: "18",
    tone: "#dc2626",
  },
  {
    label: "Reports in review",
    status: "Pending",
    value: "7",
    tone: "#2563eb",
  },
  {
    label: "Auction lots ready",
    status: "Queued",
    value: "42",
    tone: "#16a34a",
  },
];

export const reviewSteps = [
  "Client request received",
  "Asset photos organized",
  "Valuation review assigned",
  "Export package prepared",
];

export const featureCards = [
  {
    title: "Structured valuation reports",
    description:
      "Create consistent asset, real estate, and salvage reports with cleaner inputs and export-ready outputs.",
    icon: FileSpreadsheet,
  },
  {
    title: "Auction lot preparation",
    description:
      "Track assets, categories, images, lot details, and operational notes before a listing is ready.",
    icon: Layers3,
  },
  {
    title: "Team review workflow",
    description:
      "Keep appraisers, admins, and operations staff aligned around approvals, revisions, and handoffs.",
    icon: Users,
  },
  {
    title: "Secure delivery",
    description:
      "Control access, organize generated files, and keep client-ready report packages easy to find.",
    icon: ShieldCheck,
  },
];

export const controls = [
  {
    title: "Approval visibility",
    body: "See what is waiting, who owns the next action, and which reports are ready to release.",
    icon: ClipboardCheck,
  },
  {
    title: "Operational reminders",
    body: "Follow up on pending reviews, missing details, and client delivery timing from one workspace.",
    icon: BellRing,
  },
  {
    title: "McDougall managed",
    body: "Built around dependable valuation and auction operations, with a professional entry point for teams.",
    icon: Building2,
  },
  {
    title: "Protected access",
    body: "Public entry, authenticated workspace, and clean routing into signup and sign-in flows.",
    icon: LockKeyhole,
  },
];

export const dashboardRows = [
  { name: "Asset appraisal", owner: "Review team", status: "In review", progress: 72 },
  { name: "Auction lot import", owner: "Operations", status: "Queued", progress: 58 },
  { name: "Client package", owner: "Admin", status: "Ready", progress: 91 },
];

export const chartBars = [46, 64, 38, 82, 71, 88, 56, 76];

export const insightCards = [
  {
    label: "Cycle health",
    value: "82%",
    icon: BarChart3,
  },
  {
    label: "Open actions",
    value: "13",
    icon: ClipboardCheck,
  },
];
