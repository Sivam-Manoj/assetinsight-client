"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { featureCards } from "../data/constants";
import { reveal } from "./motion";

export default function FeatureGrid() {
  return (
    <section id="workflows" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        variants={reveal}
        custom={0.04}
        className="mb-10 grid w-[358px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-5 sm:w-full sm:max-w-none lg:grid-cols-[0.86fr_0.74fr] lg:items-end"
      >
        <div className="max-w-3xl max-[520px]:max-w-[330px]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--welcome-primary)]">
            Workflows
          </p>
          <h2 className="mt-3 text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-5xl">
            One polished workspace for every valuation package.
          </h2>
        </div>
        <p className="max-w-xl break-words text-base leading-7 text-[var(--welcome-muted)] lg:justify-self-end">
          Create the same professional finish across appraisal reports, salvage vehicle files, and property packages without making the team jump between disconnected tools.
        </p>
      </motion.div>

      <div className="grid w-[358px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-6 sm:w-full sm:max-w-none lg:grid-cols-3">
        {featureCards.map((item, index) => (
          <motion.article
            key={item.title}
            style={{ "--card-accent": item.accent } as CSSProperties}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={reveal}
            custom={0.04 + index * 0.04}
            className="group overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-white shadow-[var(--welcome-shadow)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--welcome-shadow-strong)]"
          >
            <div className="relative aspect-[1.08] overflow-hidden bg-[var(--welcome-bg-soft)]">
              <Image
                src={item.image}
                alt={item.alt}
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/28 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4 text-white">
                <div>
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/[0.16] backdrop-blur">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-2xl font-black leading-tight">{item.title}</h3>
                </div>
                <ArrowUpRight className="h-5 w-5 shrink-0 opacity-80 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-[var(--welcome-muted)]">{item.description}</p>
              <div className="mt-5 flex items-center justify-between border-t border-[var(--welcome-border)] pt-4">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--card-accent)]">
                  Client-ready
                </span>
                <span className="h-2 w-20 rounded-full bg-[var(--card-accent)] opacity-80" />
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
