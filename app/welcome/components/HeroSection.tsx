"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, LogIn } from "lucide-react";
import { heroMetrics } from "../data/constants";
import { reveal } from "./motion";

export default function HeroSection() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={reveal}
      custom={0.08}
      className="relative z-10 flex min-w-0 flex-col justify-center"
    >
      <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] px-3 py-2 text-xs font-semibold uppercase text-[var(--welcome-muted)]">
        <CheckCircle2 className="h-4 w-4 text-[var(--welcome-primary)]" />
        Valuation and auction operations
      </div>

      <h1 className="max-w-4xl text-4xl font-black leading-tight text-[var(--welcome-text)] sm:text-5xl lg:text-6xl">
        Asset Insight
      </h1>
      <p className="mt-4 max-w-3xl text-xl font-semibold leading-8 text-[var(--welcome-text)] sm:text-2xl">
        A cleaner workspace for appraisal reports, auction lots, and review workflow.
      </p>
      <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--welcome-muted)]">
        Bring intake, valuation, approval, and delivery into one McDougall-managed
        platform built for day-to-day operational control.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--welcome-primary)] px-5 text-sm font-bold !text-white shadow-[0_16px_34px_rgba(220,38,38,0.24)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
        >
          Start workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] px-5 text-sm font-bold text-[var(--welcome-text)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
        >
          Login
          <LogIn className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
        {heroMetrics.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] p-4"
          >
            <div className="text-2xl font-black text-[var(--welcome-text)]">{item.value}</div>
            <div className="mt-1 text-xs font-semibold uppercase text-[var(--welcome-muted)]">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
