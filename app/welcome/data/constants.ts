import {
  Building2,
  CarFront,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  LandPlot,
  Layers3,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

export const navItems = [
  { label: "Workflows", href: "#workflows" },
  { label: "Delivery", href: "#delivery" },
  { label: "Teams", href: "#teams" },
];

export const heroHighlights = [
  "Asset reports",
  "Salvage vehicle files",
  "Real estate packages",
];

export const featureCards = [
  {
    title: "Asset reports",
    description:
      "Turn equipment photos, notes, and valuations into polished report packages your client can understand quickly.",
    image: "/welcome/asset-reports-real.png",
    alt: "Professional heavy equipment asset appraisal workspace",
    icon: FileSpreadsheet,
    accent: "#dc2626",
  },
  {
    title: "Salvage vehicles",
    description:
      "Document vehicle condition, organize photos, and prepare auction-ready salvage packages with a stronger visual record.",
    image: "/welcome/salvage-vehicles-real.png",
    alt: "Damaged salvage vehicles in a professional inspection bay",
    icon: CarFront,
    accent: "#0f766e",
  },
  {
    title: "Real estate",
    description:
      "Bring property photos, site notes, maps, and supporting documents into a clean valuation experience.",
    image: "/welcome/real-estate-real.png",
    alt: "Rural real estate appraisal scene with property report materials",
    icon: Building2,
    accent: "#2563eb",
  },
];

export const journeySteps = [
  {
    title: "Capture every detail",
    body: "Collect photos, notes, condition details, and values while the work is fresh.",
  },
  {
    title: "Shape a client-ready package",
    body: "Keep lots, reports, images, and review steps arranged in a format that feels finished.",
  },
  {
    title: "Deliver with confidence",
    body: "Move from field capture to reviewed files without losing momentum between teams.",
  },
];

export const results = [
  {
    title: "Cleaner first drafts",
    body: "Photos, values, and notes stay connected from the start, so reviews feel easier.",
    icon: ClipboardCheck,
  },
  {
    title: "Faster handoff",
    body: "Appraisers, admins, and auction teams can see what is ready and what still needs attention.",
    icon: TimerReset,
  },
  {
    title: "Better final files",
    body: "Reports, image folders, spreadsheets, and lot packages keep a consistent professional finish.",
    icon: FileCheck2,
  },
  {
    title: "Controlled delivery",
    body: "Give the right people a reliable place to prepare, review, and release client work.",
    icon: ShieldCheck,
  },
];

export const deliveryStats = [
  { label: "Reports", value: "PDF, DOCX, Excel" },
  { label: "Media", value: "Images and video" },
  { label: "Coverage", value: "Assets, vehicles, property" },
];

export const industryTiles = [
  { label: "Equipment", icon: Layers3 },
  { label: "Vehicles", icon: CarFront },
  { label: "Property", icon: LandPlot },
];
