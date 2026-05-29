"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { navItems } from "../data/constants";
import { reveal } from "./motion";

export default function WelcomeHeader() {
  return (
    <motion.header
      initial="hidden"
      animate="visible"
      variants={reveal}
      custom={0}
      className="relative z-20 mx-auto flex h-[72px] w-full max-w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:max-w-7xl lg:px-8"
    >
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-white">
          <Image src="/icon.png" alt="Asset Insight" fill sizes="40px" className="object-cover" priority />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-white">
            Asset Insight
          </span>
          <span className="hidden text-xs font-semibold text-slate-300 sm:block">
            Managed by McDougall Auctioneers
          </span>
        </span>
      </Link>

      <nav className="hidden items-center gap-7 text-sm font-bold text-slate-200 md:flex">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className="transition hover:text-white">
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/login"
          className="hidden h-10 items-center rounded-md border border-white/[0.18] bg-white/10 px-4 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70 sm:inline-flex"
        >
          Login
        </Link>
        <Link
          href="/signup"
          aria-label="Start now"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--welcome-primary)] px-4 text-sm font-black !text-white shadow-[0_14px_28px_rgba(220,38,38,0.28)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70 max-[520px]:w-10 max-[520px]:justify-center max-[520px]:px-0"
        >
          <span className="max-[520px]:sr-only">Start</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.header>
  );
}
