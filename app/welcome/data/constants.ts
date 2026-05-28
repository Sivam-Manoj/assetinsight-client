import {
  ClipboardCheck,
  FileSpreadsheet,
  ImagePlus,
  Layers3,
  Sparkles,
  ShieldCheck,
  Users,
} from "lucide-react";

export const navItems = [
  { label: "Reports", href: "#reports" },
  { label: "Lots", href: "#lots" },
  { label: "Results", href: "#results" },
];

export const heroHighlights = [
  "Create polished valuation reports",
  "Prepare auction lots from field photos",
  "Keep reviews and downloads moving",
];

export const featureCards = [
  {
    title: "Polished appraisal reports",
    description:
      "Build clear, professional report packages with photos, values, notes, and client-ready exports.",
    image: "/welcome/report-package.png",
    alt: "Layered appraisal report package artwork",
    icon: FileSpreadsheet,
  },
  {
    title: "Auction lots that stay organized",
    description:
      "Group assets into clean listings with images, descriptions, categories, and sale-ready details.",
    image: "/welcome/lot-gallery.png",
    alt: "Auction lot gallery artwork",
    icon: Layers3,
  },
  {
    title: "Field capture made simple",
    description:
      "Capture photos and notes on the move, then bring the work back to the team for review.",
    image: "/welcome/field-capture.png",
    alt: "Mobile field capture artwork",
    icon: ImagePlus,
  },
];

export const journeySteps = [
  {
    title: "Capture the work",
    body: "Add asset photos, field notes, values, and lot details while the information is fresh.",
  },
  {
    title: "Shape the package",
    body: "Organize reports and listings into a format that is easy for your team to review.",
  },
  {
    title: "Send with confidence",
    body: "Download the finished files, share the right package, and keep the next job moving.",
  },
];

export const results = [
  {
    title: "Less rework",
    body: "Photos, notes, values, and final files stay connected from the first capture.",
    icon: ClipboardCheck,
  },
  {
    title: "A stronger client impression",
    body: "Reports and lot packages look cleaner, more consistent, and easier to approve.",
    icon: Sparkles,
  },
  {
    title: "Better team handoffs",
    body: "Appraisers, admins, and auction staff can see what is ready and what needs attention.",
    icon: Users,
  },
  {
    title: "Controlled access",
    body: "Give the right people a reliable place to start, review, and deliver client work.",
    icon: ShieldCheck,
  },
];
