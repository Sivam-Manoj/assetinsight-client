"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, LogIn } from "lucide-react";
import { heroHighlights } from "../data/constants";
import { reveal } from "./motion";

export default function HeroSection() {
  return (
    <section className="relative z-10 mx-auto min-h-[calc(100svh-14rem)] w-[calc(100%-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[var(--welcome-border)] shadow-[var(--welcome-shadow-strong)] sm:w-[calc(100%-3rem)] sm:max-w-7xl">
      <Image
        src="/welcome/hero-asset-workspace.png"
        alt="Asset Insight workspace preview with reports, lots, and mobile capture"
        fill
        priority
        sizes="(min-width: 1280px) 1280px, 100vw"
        className="object-cover object-[62%_center]"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--welcome-bg) 98%, transparent) 0%, color-mix(in srgb, var(--welcome-bg) 92%, transparent) 38%, color-mix(in srgb, var(--welcome-bg) 48%, transparent) 68%, color-mix(in srgb, var(--welcome-bg) 12%, transparent) 100%)",
        }}
      />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={reveal}
        custom={0.08}
        className="relative flex min-h-[calc(100svh-14rem)] w-full min-w-0 max-w-3xl flex-col justify-center px-5 py-12 max-[520px]:max-w-[330px] sm:px-8 md:px-12 lg:px-14"
      >
        <h1 className="max-w-full break-words text-4xl font-black leading-[1.02] text-[var(--welcome-text)] min-[420px]:text-5xl sm:text-6xl lg:text-7xl">
          Asset Insight
        </h1>
        <p className="mt-5 max-w-full break-words text-lg font-black leading-7 text-[var(--welcome-text)] sm:max-w-2xl sm:text-2xl md:leading-9">
          Create appraisal reports and auction lot packages that look ready for the client.
        </p>
        <p className="mt-5 max-w-full text-base leading-7 text-[var(--welcome-muted)] sm:max-w-xl sm:text-lg">
          Turn photos, notes, values, and review steps into a clean workspace your team can use from the field to final delivery.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--welcome-primary)] px-5 text-sm font-bold !text-white shadow-[0_16px_34px_rgba(220,38,38,0.24)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)] sm:w-auto"
          >
            Start now
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] px-5 text-sm font-bold text-[var(--welcome-text)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--welcome-ring)] sm:w-auto"
          >
            Sign in
            <LogIn className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 text-sm font-bold text-[var(--welcome-text)] sm:grid-cols-3">
          {heroHighlights.map((item) => (
            <div key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--welcome-success)]" />
              <span className="leading-5">{item}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
