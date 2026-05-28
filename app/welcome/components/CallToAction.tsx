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
          src="/welcome/field-capture.png"
          alt="Field capture and ready for review artwork"
          width={1200}
          height={900}
          className="h-[420px] w-full object-cover object-[58%_center] sm:h-[460px]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.9)_0%,rgba(7,17,31,0.72)_43%,rgba(7,17,31,0.2)_100%)]" />
        <div className="absolute inset-0 flex items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">
              Give every report a cleaner finish.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-100 sm:text-lg">
              Start with a workspace built for the way appraisal and auction teams actually deliver client work.
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
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/28 bg-white/12 px-5 text-sm font-bold text-white backdrop-blur transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
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
