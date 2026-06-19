"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

type LatestApkResponse = {
  available?: boolean;
  latestVersionName?: string;
  latestVersionCode?: number;
  downloadUrl?: string;
};

const SERVER_BASE = (
  process.env.NEXT_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://api.assetinsightvaluator.com"
).replace(/\/api\/?$/, "").replace(/\/+$/, "");

export default function AndroidApkDownloadButton({ variant = "solid" }: { variant?: "solid" | "glass" }) {
  const [latest, setLatest] = useState<LatestApkResponse | null>(null);

  const fallbackUrl = `${SERVER_BASE}/api/app-version/android/latest/download`;
  const href = fallbackUrl;
  const versionLabel = useMemo(() => {
    if (!latest?.available || !latest.latestVersionName) return "Android APK";
    return `Android APK v${latest.latestVersionName}`;
  }, [latest]);

  useEffect(() => {
    let mounted = true;
    fetch(`${SERVER_BASE}/api/app-version/android/latest`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setLatest(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const className =
    variant === "glass"
      ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/[0.24] bg-white/[0.12] px-6 text-sm font-black text-white backdrop-blur-md transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70"
      : "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--welcome-primary)] px-6 text-sm font-black !text-white shadow-[0_18px_40px_rgba(220,38,38,0.32)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70";

  return (
    <a href={href} className={className}>
      <Download className="h-4 w-4" />
      Download {versionLabel}
    </a>
  );
}
