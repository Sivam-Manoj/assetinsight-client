"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { journeySteps } from "../data/constants";
import { reveal } from "./motion";

export default function OperationsCockpit() {
  return (
    <section id="lots" className="relative z-10 border-y border-[var(--welcome-border)] bg-[var(--welcome-band)]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.05}
          className="max-w-xl"
        >
          <h2 className="text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
            From first photo to final package, the work stays clear.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
            Asset Insight helps appraisal and auction teams keep the important details together, so the finished package feels organized before it reaches the client.
          </p>

          <div className="mt-8 space-y-5">
            {journeySteps.map((step, index) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--welcome-primary)] text-sm font-black text-white">
                    {index + 1}
                  </span>
                  {index < journeySteps.length - 1 ? (
                    <span className="mt-2 h-10 w-px bg-[var(--welcome-border)]" />
                  ) : null}
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--welcome-text)]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--welcome-muted)]">{step.body}</p>
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
          className="relative"
        >
          <div className="relative overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] shadow-[var(--welcome-shadow-strong)]">
            <Image
              src="/welcome/report-package.png"
              alt="Client-ready report package artwork"
              width={1200}
              height={900}
              className="h-auto w-full"
            />
          </div>
          <div className="absolute -bottom-5 left-5 right-5 flex items-center justify-between gap-4 rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] p-4 shadow-[var(--welcome-shadow)] sm:left-auto sm:right-6 sm:w-80">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[var(--welcome-success)]" />
              <div>
                <p className="text-sm font-black text-[var(--welcome-text)]">Package ready</p>
                <p className="text-xs text-[var(--welcome-muted)]">Reports, images, and lots together</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--welcome-primary)]" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
