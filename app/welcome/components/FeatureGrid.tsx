"use client";

import { motion } from "framer-motion";
import { featureCards } from "../data/constants";
import { reveal } from "./motion";
import Surface from "./Surface";

export default function FeatureGrid() {
  return (
    <section id="workflow" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-bold uppercase text-[var(--welcome-primary)]">Workflow</p>
        <h2 className="mt-3 text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
          Built around the work your team repeats every day.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureCards.map((item, index) => (
          <motion.div
            key={item.title}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={reveal}
            custom={0.04 + index * 0.04}
          >
            <Surface className="h-full p-5 transition hover:-translate-y-1">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--welcome-primary-soft)] text-[var(--welcome-primary)]">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-[var(--welcome-text)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--welcome-muted)]">{item.description}</p>
            </Surface>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
