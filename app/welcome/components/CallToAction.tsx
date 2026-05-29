"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function CallToAction() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8"
    >
      <div className="relative overflow-hidden rounded-lg border border-[var(--welcome-border)] shadow-[var(--welcome-shadow-strong)]">
        <Image
          src="/welcome/salvage-vehicles-real.png"
          alt="Salvage vehicle inspection and client report package"
          width={1200}
          height={900}
          className="h-[430px] w-full object-cover object-[55%_center] sm:h-[500px]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.94)_0%,rgba(7,17,31,0.76)_42%,rgba(7,17,31,0.18)_100%)]" />
        <div className="absolute inset-0 flex items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-red-200">
              Ready when the team is
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
              Give every client file a stronger first impression.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-100 sm:text-lg">
              Bring asset reports, salvage vehicle records, and real estate packages into a clearer workflow that looks as professional as the work behind it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--welcome-primary)] px-5 text-sm font-bold !text-white shadow-[0_16px_34px_rgba(220,38,38,0.28)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Start now
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/[0.28] bg-white/[0.12] px-5 text-sm font-bold text-white backdrop-blur transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
