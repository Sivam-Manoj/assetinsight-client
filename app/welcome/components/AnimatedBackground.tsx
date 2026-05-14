"use client";

import { motion } from "framer-motion";

export default function AnimatedBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[var(--welcome-bg)]"
    >
      <div
        className="absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--welcome-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--welcome-grid) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, var(--welcome-bg) 78%), linear-gradient(120deg, transparent 0%, var(--welcome-bg-soft) 58%, transparent 100%)",
        }}
      />
      <motion.div
        className="absolute left-0 top-0 h-full w-full"
        animate={{ opacity: [0.42, 0.58, 0.42] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "linear-gradient(110deg, transparent 0%, var(--welcome-sweep) 44%, transparent 62%)",
        }}
      />
    </div>
  );
}
