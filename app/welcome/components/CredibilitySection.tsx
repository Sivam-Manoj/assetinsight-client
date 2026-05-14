"use client";

import { motion } from "framer-motion";
import { controls } from "../data/constants";
import { reveal } from "./motion";
import Surface from "./Surface";

export default function CredibilitySection() {
  return (
    <section
      id="controls"
      className="relative z-10 border-y border-[var(--welcome-border)] bg-[var(--welcome-band)]"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={reveal}
          custom={0.05}
          className="max-w-xl"
        >
          <p className="text-sm font-bold uppercase text-[var(--welcome-primary)]">Controls</p>
          <h2 className="mt-3 text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
            Clear status, cleaner handoffs, fewer loose ends.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
            Asset Insight gives teams a professional starting point for report generation,
            lot preparation, review ownership, and delivery readiness.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          {controls.map((item, index) => (
            <motion.div
              key={item.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={reveal}
              custom={0.08 + index * 0.04}
            >
              <Surface className="h-full p-5">
                <item.icon className="h-5 w-5 text-[var(--welcome-primary)]" />
                <h3 className="mt-4 text-lg font-black text-[var(--welcome-text)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--welcome-muted)]">{item.body}</p>
              </Surface>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
