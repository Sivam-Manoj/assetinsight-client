"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, CopyPlus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  reportLabel: string;
  onResume: () => void;
  onCreateSeparate: () => void;
  onCancel: () => void;
};

export default function ActiveReportConflictDialog({
  open,
  reportLabel,
  onResume,
  onCreateSeparate,
  onCancel,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-report-title"
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="active-report-title" className="text-base font-bold text-slate-950">
              Report already processing
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              A {reportLabel} with this contract is already queued or processing. Resume it to avoid a duplicate, or explicitly create a separate report.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <button
            type="button"
            onClick={onResume}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <RotateCcw className="h-4 w-4" />
            Resume Existing
          </button>
          <button
            type="button"
            onClick={onCreateSeparate}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
          >
            <CopyPlus className="h-4 w-4" />
            Create Separate Report
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
