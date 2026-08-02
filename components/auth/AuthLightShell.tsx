"use client";

import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import BrandLockup from "@/components/auth/BrandLockup";
import ThemeToggle from "@/components/auth/ThemeToggle";

export const AUTH_LABEL_CLASS =
  "mb-4 block text-sm font-medium text-[var(--app-text)]";

export const AUTH_INPUT_CLASS =
  "h-14 w-full rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] px-4 text-base text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60";

export const AUTH_TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] px-4 py-3 text-base text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60";

export const AUTH_PRIMARY_BUTTON_CLASS =
  "inline-flex h-16 items-center justify-center gap-2 rounded-lg bg-[var(--app-accent)] px-6 text-sm font-semibold text-[var(--app-panel)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-panel)] disabled:cursor-not-allowed disabled:opacity-60";

export const AUTH_SECONDARY_BUTTON_CLASS =
  "inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] px-5 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-60";

export function AuthFormHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--app-accent)]">
        {label}
      </p>
      <h2 className="mt-8 text-4xl font-semibold tracking-[-0.04em] text-[var(--app-text)] sm:text-5xl">
        {title}
      </h2>
      <p className="mt-7 max-w-xl text-base leading-7 text-[var(--app-text-muted)] sm:text-lg">
        {description}
      </p>
    </div>
  );
}

export function AuthNotice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]"
      : tone === "success"
        ? "border-[var(--app-success-border)] bg-[var(--app-success-soft)] text-[var(--app-success)]"
        : "border-[var(--app-info-border)] bg-[var(--app-info-soft)] text-[var(--app-info)]";

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm leading-6 ${toneClass}`}>
      {children}
    </div>
  );
}

export function AuthSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={`${className} animate-spin`} />;
}

export default function AuthLightShell({
  title,
  description,
  features,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  features: string[];
  children: React.ReactNode;
}) {
  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@assetinsightvaluation.com";

  return (
    <main className="min-h-screen bg-[var(--app-panel)] text-[var(--app-text)]">
      <header className="flex h-[92px] items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-panel)] px-5 sm:px-8 lg:px-10">
        <Link
          href="/welcome"
          aria-label="Asset Insight home"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          <BrandLockup />
        </Link>
        <ThemeToggle />
      </header>

      <div className="grid min-h-[calc(100vh-92px)] lg:grid-cols-[minmax(360px,41.5%)_minmax(0,58.5%)]">
        <aside className="hidden bg-[#071d36] px-10 pb-16 pt-[188px] text-white lg:flex lg:items-start xl:px-16">
          <div className="max-w-[520px]">
            <h1 className="text-4xl font-semibold leading-[1.35] tracking-[-0.035em] xl:text-[2.65rem]">
              {title}
            </h1>
            <p className="mt-7 max-w-lg whitespace-pre-line text-xl leading-8 text-slate-300">
              {description}
            </p>
            <ul className="mt-14 space-y-10">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-5 text-xl text-slate-100">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[#1670ff] text-[#4590ff]">
                    <Check className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-[var(--app-panel)]">
          <div className="flex flex-1 items-start px-5 pb-12 pt-[84px] sm:px-10 lg:px-16 xl:px-[5.5rem]">
            <div className="mx-auto w-full max-w-[750px]">{children}</div>
          </div>
          <footer className="flex items-center justify-center gap-5 px-5 pb-10 text-sm text-[var(--app-text-muted)]">
            <Link className="transition-colors hover:text-[var(--app-text)]" href="/privacy">
              Privacy
            </Link>
            <span aria-hidden="true" className="h-5 w-px bg-[var(--app-border)]" />
            <a className="transition-colors hover:text-[var(--app-text)]" href={`mailto:${supportEmail}`}>
              Support
            </a>
          </footer>
        </section>
      </div>
    </main>
  );
}
