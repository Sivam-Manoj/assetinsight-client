"use client";

import { motion } from "framer-motion";
import { results } from "../data/constants";
import { reveal } from "./motion";

export default function CredibilitySection() {
  return (
    <section id="results" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.05}
          className="max-w-xl"
        >
          <h2 className="text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
            A better impression for clients, and a better day for the team.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
            The strongest appraisal experience is calm, clear, and easy to follow. Asset Insight keeps the work presentable from the first upload to the final download.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          {results.map((item, index) => (
            <motion.article
              key={item.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={reveal}
              custom={0.08 + index * 0.04}
              className="rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] p-5 shadow-[var(--welcome-shadow)]"
            >
              <item.icon className="h-5 w-5 text-[var(--welcome-primary)]" />
              <h3 className="mt-4 text-lg font-black text-[var(--welcome-text)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--welcome-muted)]">{item.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
