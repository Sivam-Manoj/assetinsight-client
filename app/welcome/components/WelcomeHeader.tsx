"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MoonStar, SunMedium } from "lucide-react";
import { useColorMode } from "@/components/providers/ColorModeProvider";
import { navItems } from "../data/constants";
import { reveal } from "./motion";

export default function WelcomeHeader() {
  const { resolvedTheme, toggleMode } = useColorMode();
  const isDark = resolvedTheme === "dark";

  return (
    <motion.header
      initial="hidden"
      animate="visible"
      variants={reveal}
      custom={0}
      className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
    >
      <Link href="/welcome" className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-white">
          <Image src="/icon.png" alt="Asset Insight" fill sizes="40px" className="object-cover" priority />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--welcome-text)]">
            Asset Insight
          </span>
          <span className="hidden text-xs text-[var(--welcome-muted)] sm:block">
            Managed by McDougall Auctioneers
          </span>
        </span>
      </Link>

      <nav className="hidden items-center gap-6 text-sm font-medium text-[var(--welcome-muted)] md:flex">
        {navItems.map((item) => (
          <a key={item} href={`#${item.toLowerCase()}`} className="transition hover:text-[var(--welcome-text)]">
            {item}
          </a>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleMode}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] text-[var(--welcome-text)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </button>
        <Link
          href="/login"
          className="hidden h-10 items-center rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] px-4 text-sm font-semibold text-[var(--welcome-text)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)] sm:inline-flex"
        >
          Login
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--welcome-primary)] px-4 text-sm font-bold !text-white shadow-[0_14px_28px_rgba(220,38,38,0.22)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
        >
          Start
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.header>
  );
}
