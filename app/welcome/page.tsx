import type { CSSProperties } from "react";
import CallToAction from "./components/CallToAction";
import CredibilitySection from "./components/CredibilitySection";
import FeatureGrid from "./components/FeatureGrid";
import HeroSection from "./components/HeroSection";
import OperationsCockpit from "./components/OperationsCockpit";
import WelcomeHeader from "./components/WelcomeHeader";

const welcomeVars = {
  "--welcome-bg": "var(--app-bg)",
  "--welcome-bg-soft": "color-mix(in srgb, var(--app-panel-alt) 82%, var(--app-bg) 18%)",
  "--welcome-surface": "color-mix(in srgb, var(--app-panel) 96%, transparent)",
  "--welcome-band": "color-mix(in srgb, var(--app-panel-alt) 68%, transparent)",
  "--welcome-text": "var(--app-text)",
  "--welcome-muted": "var(--app-text-muted)",
  "--welcome-border": "var(--app-border)",
  "--welcome-primary": "#dc2626",
  "--welcome-primary-soft": "color-mix(in srgb, #dc2626 11%, transparent)",
  "--welcome-blue": "#2563eb",
  "--welcome-blue-soft": "color-mix(in srgb, #2563eb 10%, transparent)",
  "--welcome-success": "#16a34a",
  "--welcome-success-soft": "color-mix(in srgb, #16a34a 13%, transparent)",
  "--welcome-ring": "color-mix(in srgb, #dc2626 42%, transparent)",
  "--welcome-shadow": "0 16px 44px rgba(15, 23, 42, 0.08)",
  "--welcome-shadow-strong": "0 28px 80px rgba(15, 23, 42, 0.16)",
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
