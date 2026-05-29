import type { CSSProperties } from "react";
import CallToAction from "./components/CallToAction";
import CredibilitySection from "./components/CredibilitySection";
import FeatureGrid from "./components/FeatureGrid";
import HeroSection from "./components/HeroSection";
import OperationsCockpit from "./components/OperationsCockpit";
import WelcomeHeader from "./components/WelcomeHeader";

const welcomeVars = {
  "--welcome-bg": "#f6f8fb",
  "--welcome-bg-soft": "#edf2f7",
  "--welcome-surface": "rgba(255, 255, 255, 0.88)",
  "--welcome-band": "#0b1220",
  "--welcome-text": "#07111f",
  "--welcome-muted": "#475569",
  "--welcome-border": "rgba(15, 23, 42, 0.1)",
  "--welcome-primary": "#dc2626",
  "--welcome-primary-soft": "color-mix(in srgb, #dc2626 11%, transparent)",
  "--welcome-blue": "#2563eb",
  "--welcome-blue-soft": "color-mix(in srgb, #2563eb 10%, transparent)",
  "--welcome-success": "#16a34a",
  "--welcome-success-soft": "color-mix(in srgb, #16a34a 13%, transparent)",
  "--welcome-ring": "color-mix(in srgb, #dc2626 42%, transparent)",
  "--welcome-ink": "#07111f",
  "--welcome-shadow": "0 18px 46px rgba(15, 23, 42, 0.1)",
  "--welcome-shadow-strong": "0 30px 90px rgba(15, 23, 42, 0.2)",
} as CSSProperties;

export default function WelcomePage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[var(--welcome-bg)] text-[var(--welcome-text)]"
      style={welcomeVars}
    >
      <WelcomeHeader />
      <HeroSection />
      <FeatureGrid />
      <OperationsCockpit />
      <CredibilitySection />
      <CallToAction />
    </main>
  );
}
