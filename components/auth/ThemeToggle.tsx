"use client";

import { Moon, Sun } from "lucide-react";
import { useColorMode } from "@/components/providers/ColorModeProvider";

export default function ThemeToggle() {
  const { resolvedTheme, setMode } = useColorMode();

  return (
    <div
      className="inline-flex h-[52px] items-center rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] p-1"
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        aria-label="Use light theme"
        aria-pressed={resolvedTheme === "light"}
        onClick={() => setMode("light")}
        className={`grid h-11 w-14 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
          resolvedTheme === "light"
            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
            : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
        }`}
      >
        <Sun className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <span aria-hidden="true" className="h-6 w-px bg-[var(--app-border)]" />
      <button
        type="button"
        aria-label="Use dark theme"
        aria-pressed={resolvedTheme === "dark"}
        onClick={() => setMode("dark")}
        className={`grid h-11 w-14 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
          resolvedTheme === "dark"
            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
            : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
        }`}
      >
        <Moon className="h-5 w-5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
