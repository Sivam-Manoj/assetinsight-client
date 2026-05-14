import type { CSSProperties } from "react";
import AnimatedBackground from "./components/AnimatedBackground";
import CallToAction from "./components/CallToAction";
import CredibilitySection from "./components/CredibilitySection";
import FeatureGrid from "./components/FeatureGrid";
import HeroSection from "./components/HeroSection";
import OperationsCockpit from "./components/OperationsCockpit";
import WelcomeHeader from "./components/WelcomeHeader";

const welcomeVars = {
  "--welcome-bg": "var(--app-bg)",
  "--welcome-bg-soft": "color-mix(in srgb, var(--app-panel-alt) 72%, var(--app-bg) 28%)",
  "--welcome-surface": "color-mix(in srgb, var(--app-panel) 94%, transparent)",
  "--welcome-console": "color-mix(in srgb, var(--app-panel-alt) 86%, var(--app-bg) 14%)",
  "--welcome-band": "color-mix(in srgb, var(--app-panel-alt) 58%, transparent)",
  "--welcome-text": "var(--app-text)",
  "--welcome-muted": "var(--app-text-muted)",
  "--welcome-border": "var(--app-border)",
  "--welcome-grid": "color-mix(in srgb, var(--app-text-muted) 12%, transparent)",
  "--welcome-primary": "#dc2626",
  "--welcome-primary-soft": "color-mix(in srgb, #dc2626 11%, transparent)",
  "--welcome-success": "#16a34a",
  "--welcome-success-soft": "color-mix(in srgb, #16a34a 13%, transparent)",
  "--welcome-chart": "color-mix(in srgb, #2563eb 70%, #16a34a 30%)",
  "--welcome-ring": "color-mix(in srgb, #dc2626 42%, transparent)",
  "--welcome-shadow": "0 16px 44px rgba(15, 23, 42, 0.08)",
  "--welcome-shadow-strong": "0 28px 80px rgba(15, 23, 42, 0.16)",
  "--welcome-sweep": "color-mix(in srgb, var(--app-panel) 28%, transparent)",
} as CSSProperties;

export default function WelcomePage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[var(--welcome-bg)] text-[var(--welcome-text)]"
      style={welcomeVars}
    >
      <AnimatedBackground />
      <WelcomeHeader />

      <section className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-4 pb-12 pt-8 sm:px-6 md:pb-16 md:pt-12 lg:grid-cols-[0.98fr_1.02fr] lg:items-start lg:px-8 lg:pt-14">
        <HeroSection />
        <OperationsCockpit />
      </section>

      <FeatureGrid />
      <CredibilitySection />
      <CallToAction />
    </main>
  );
}
