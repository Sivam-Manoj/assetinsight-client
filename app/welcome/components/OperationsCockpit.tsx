"use client";

import { motion } from "framer-motion";
import { Activity, ArrowUpRight, CheckCircle2 } from "lucide-react";
import {
  chartBars,
  dashboardRows,
  insightCards,
  reviewSteps,
  workflowLanes,
} from "../data/constants";
import { reveal } from "./motion";

export default function OperationsCockpit() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={reveal}
      custom={0.14}
      className="relative z-10 w-full"
    >
      <div className="rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-console)] p-3 shadow-[var(--welcome-shadow-strong)]">
        <div className="rounded-lg border border-[var(--welcome-border)] bg-[var(--welcome-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--welcome-border)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--welcome-muted)]">
                Operations cockpit
              </p>
              <h2 className="mt-1 text-lg font-black text-[var(--welcome-text)]">
                Work moving today
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[var(--welcome-success-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--welcome-success)]">
              <Activity className="h-3.5 w-3.5" />
              Live
            </div>
          </div>

          <div className="grid gap-px bg-[var(--welcome-border)] sm:grid-cols-3">
            {workflowLanes.map((item) => (
              <div key={item.label} className="bg-[var(--welcome-surface)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-[var(--welcome-muted)]">
                    {item.status}
                  </span>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.tone }} />
                </div>
                <p className="mt-3 text-3xl font-black text-[var(--welcome-text)]">{item.value}</p>
                <p className="mt-1 text-sm text-[var(--welcome-muted)]">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-px bg-[var(--welcome-border)] lg:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-[var(--welcome-surface)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--welcome-text)]">Report pipeline</p>
                <ArrowUpRight className="h-4 w-4 text-[var(--welcome-primary)]" />
              </div>
              <div className="space-y-3">
                {dashboardRows.map((row) => (
                  <div key={row.name} className="rounded-lg border border-[var(--welcome-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--welcome-text)]">
                          {row.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--welcome-muted)]">{row.owner}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-[var(--welcome-bg-soft)] px-2 py-1 text-xs font-semibold text-[var(--welcome-muted)]">
                        {row.status}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-sm bg-[var(--welcome-bg-soft)]">
                      <motion.div
                        className="h-full rounded-sm bg-[var(--welcome-primary)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${row.progress}%` }}
                        transition={{ duration: 0.75, delay: 0.15 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--welcome-surface)] p-4">
              <p className="text-sm font-bold text-[var(--welcome-text)]">Review path</p>
              <div className="mt-4 space-y-3">
                {reviewSteps.map((step, index) => (
                  <div key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <CheckCircle2
                        className="h-4 w-4"
                        style={{
                          color:
                            index === reviewSteps.length - 1
                              ? "var(--welcome-success)"
                              : "var(--welcome-primary)",
                        }}
                      />
                      {index < reviewSteps.length - 1 ? (
                        <span className="mt-1 h-7 w-px bg-[var(--welcome-border)]" />
                      ) : null}
                    </div>
                    <p className="text-sm leading-5 text-[var(--welcome-muted)]">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {insightCards.map((item) => (
                  <div key={item.label} className="rounded-lg border border-[var(--welcome-border)] p-3">
                    <item.icon className="h-4 w-4 text-[var(--welcome-primary)]" />
                    <p className="mt-3 text-xl font-black text-[var(--welcome-text)]">{item.value}</p>
                    <p className="mt-1 text-xs text-[var(--welcome-muted)]">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--welcome-border)] p-4">
            <div className="flex h-28 items-end gap-2">
              {chartBars.map((height, index) => (
                <motion.div
                  key={`${height}-${index}`}
                  className="min-w-0 flex-1 rounded-sm bg-[var(--welcome-chart)]"
                  initial={{ height: "18%" }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.7, delay: index * 0.04 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
