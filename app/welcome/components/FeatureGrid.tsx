"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { featureCards } from "../data/constants";
import { reveal } from "./motion";

export default function FeatureGrid() {
  return (
    <section id="reports" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-9 max-w-3xl max-[520px]:max-w-[330px]">
        <h2 className="text-3xl font-black leading-tight text-[var(--welcome-text)] sm:text-4xl">
          Everything needed to move from photos to client-ready files.
        </h2>
        <p className="mt-4 text-base leading-7 text-[var(--welcome-muted)]">
          Give your team one polished place to create reports, prepare lots, and keep client work moving.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {featureCards.map((item, index) => (
          <motion.article
            key={item.title}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={reveal}
            custom={0.04 + index * 0.04}
            className="overflow-hidden rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)] shadow-[var(--welcome-shadow)] transition hover:-translate-y-1"
          >
            <div className="relative aspect-[4/3] bg-[var(--welcome-bg-soft)]">
              <Image
                src={item.image}
                alt={item.alt}
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-5">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--welcome-primary-soft)] text-[var(--welcome-primary)]">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-black text-[var(--welcome-text)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--welcome-muted)]">{item.description}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
