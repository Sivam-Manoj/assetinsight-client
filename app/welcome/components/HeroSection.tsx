"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FileCheck2 } from "lucide-react";
import { deliveryStats, heroHighlights, industryTiles } from "../data/constants";
import AndroidApkDownloadButton from "./AndroidApkDownloadButton";
import { reveal } from "./motion";

export default function HeroSection() {
  return (
    <section className="relative isolate -mt-[72px] min-h-[82svh] overflow-hidden bg-[var(--welcome-ink)] pt-[72px] text-white">
      <Image
        src="/welcome/enterprise-hero.png"
        alt="Asset Insight workspace with appraisal reports, equipment photos, and auction yard"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[62%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.94)_0%,rgba(7,17,31,0.82)_34%,rgba(7,17,31,0.34)_70%,rgba(7,17,31,0.08)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--welcome-bg)] via-[rgba(246,248,251,0.62)] to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[calc(82svh-72px)] w-full max-w-7xl items-center px-4 pb-14 pt-10 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={reveal}
          custom={0.08}
          className="grid w-full min-w-0 grid-cols-1 gap-10 lg:grid-cols-[0.92fr_0.78fr] lg:items-end"
        >
          <div className="w-[358px] min-w-0 max-w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl">
            <h1 className="max-w-full break-words text-5xl font-black leading-[0.96] tracking-normal text-white sm:text-7xl lg:text-8xl">
              Asset Insight
            </h1>
            <p className="mt-6 max-w-full break-words text-lg font-semibold leading-8 text-white sm:max-w-2xl sm:text-2xl sm:leading-9">
              Client-ready appraisal, salvage, and property report packages from the field to final delivery.
            </p>
            <p className="mt-5 max-w-full break-words text-base leading-7 text-slate-200 sm:max-w-xl sm:text-lg">
              Capture the work, organize the package, and give every client a cleaner, more confident finish.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--welcome-primary)] px-6 text-sm font-black !text-white shadow-[0_18px_40px_rgba(220,38,38,0.32)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Start now
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/[0.24] bg-white/[0.12] px-6 text-sm font-black text-white backdrop-blur-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Sign in
              </Link>
              <AndroidApkDownloadButton variant="glass" />
            </div>

            <div className="mt-9 grid gap-3 text-sm font-bold text-white sm:grid-cols-3">
              {heroHighlights.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <motion.div
            aria-hidden="true"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="hidden justify-self-end rounded-md border border-white/[0.16] bg-white/[0.12] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:block"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.12] pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-[var(--welcome-primary)]">
                <FileCheck2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-white">Delivery package</p>
                <p className="text-xs font-semibold text-slate-300">Ready for client review</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {deliveryStats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between gap-6 text-sm">
                  <span className="font-semibold text-slate-300">{stat.label}</span>
                  <span className="font-black text-white">{stat.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {industryTiles.map((item) => (
                <div key={item.label} className="rounded-md bg-white/10 px-3 py-3 text-center">
                  <item.icon className="mx-auto h-5 w-5 text-white" />
                  <p className="mt-2 text-[11px] font-black text-slate-200">{item.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
