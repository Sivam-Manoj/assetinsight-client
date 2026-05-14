"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function CallToAction() {
  return (
    <motion.section
      id="security"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <div className="grid gap-8 rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] p-6 shadow-[var(--welcome-shadow)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-[var(--welcome-primary-soft)] px-3 py-2 text-sm font-bold text-[var(--welcome-primary)]">
            <ShieldCheck className="h-4 w-4" />
            Secure workspace access
          </div>
          <h2 className="text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
            Open Asset Insight and keep the next report moving.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
            Sign in to continue a review, or create an account to start managing reports,
            lots, and delivery files from the same workspace.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--welcome-primary)] px-5 text-sm font-bold !text-white shadow-[0_16px_34px_rgba(220,38,38,0.22)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
          >
            Start workspace
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-bg-soft)] px-5 text-sm font-bold text-[var(--welcome-text)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)]"
          >
            Login
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
