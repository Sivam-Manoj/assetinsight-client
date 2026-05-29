"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, ImageIcon, Rows3, Send } from "lucide-react";
import { journeySteps } from "../data/constants";
import { reveal } from "./motion";

const deliverables = [
  { label: "Report package", icon: FileText },
  { label: "Image set", icon: ImageIcon },
  { label: "Lot workbook", icon: Rows3 },
];

export default function OperationsCockpit() {
  return (
    <section id="delivery" className="relative z-10 overflow-hidden bg-[var(--welcome-band)] text-white">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.86fr_1fr] lg:items-center lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.05}
          className="max-w-xl"
        >
          <p className="text-sm font-black uppercase tracking-[0.18em] text-red-300">
            Delivery
          </p>
          <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
            From field capture to a finished client package.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Keep photos, notes, lots, and review work moving in one clear path, so every package looks organized before it reaches the client.
          </p>

          <div className="mt-9 space-y-5">
            {journeySteps.map((step, index) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-sm font-black text-[var(--welcome-primary)]">
                    {index + 1}
                  </span>
                  {index < journeySteps.length - 1 ? (
                    <span className="mt-2 h-10 w-px bg-white/[0.18]" />
                  ) : null}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.12}
          className="relative min-h-[540px]"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="relative overflow-hidden rounded-lg border border-white/[0.14] bg-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur"
          >
            <Image
              src="/welcome/asset-reports-real.png"
              alt="Finished appraisal package with photos and report material"
              width={1200}
              height={900}
              className="h-[340px] w-full object-cover sm:h-[420px]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#07111f]/88 via-[#07111f]/30 to-transparent p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-red-200">Review ready</p>
              <p className="mt-2 max-w-md text-2xl font-black leading-tight text-white">
                Photos, values, and lot details stay together.
              </p>
            </div>
          </motion.div>

          <motion.div
            animate={{ x: [0, 8, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -bottom-2 left-4 right-4 rounded-lg border border-white/[0.16] bg-white p-4 text-[var(--welcome-text)] shadow-[0_22px_70px_rgba(0,0,0,0.28)] sm:left-auto sm:right-8 sm:w-[360px]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--welcome-success-soft)] text-[var(--welcome-success)]">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-black">Package ready</p>
                  <p className="text-xs font-semibold text-[var(--welcome-muted)]">Everything in one handoff</p>
                </div>
              </div>
              <Send className="h-5 w-5 text-[var(--welcome-primary)]" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {deliverables.map((item) => (
                <div key={item.label} className="rounded-md border border-[var(--welcome-border)] bg-[var(--welcome-bg-soft)] px-2 py-3 text-center">
                  <item.icon className="mx-auto h-4 w-4 text-[var(--welcome-primary)]" />
                  <p className="mt-2 text-[11px] font-black leading-tight text-[var(--welcome-text)]">{item.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
