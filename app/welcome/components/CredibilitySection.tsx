"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { results } from "../data/constants";
import { reveal } from "./motion";

export default function CredibilitySection() {
  return (
    <section id="teams" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid w-[358px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-10 sm:w-full sm:max-w-none lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.05}
          className="max-w-xl"
        >
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--welcome-primary)]">
            Teams
          </p>
          <h2 className="mt-3 text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-5xl">
            Built for appraisers, admins, and auction teams.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
            The experience stays calm and easy to follow, from the first inspection photo to the package a client can download and review.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-white shadow-[var(--welcome-shadow)]">
            <div className="relative aspect-[16/10]">
              <Image
                src="/welcome/real-estate-real.png"
                alt="Property appraisal scene with organized client materials"
                fill
                sizes="(min-width: 1024px) 34vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="grid grid-cols-3 divide-x divide-[var(--welcome-border)] text-center">
              {["Capture", "Review", "Deliver"].map((item) => (
                <div key={item} className="px-2 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--welcome-muted)]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {results.map((item, index) => (
            <motion.article
              key={item.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={reveal}
              custom={0.08 + index * 0.04}
              className="rounded-lg border border-[var(--welcome-border)] bg-white p-6 shadow-[var(--welcome-shadow)]"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--welcome-primary-soft)] text-[var(--welcome-primary)]">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-black text-[var(--welcome-text)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--welcome-muted)]">{item.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
