"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import AuthLightShell from "@/components/auth/AuthLightShell";

const LOGIN_FEATURES = [
  "Valuation workspace",
  "Saved reports",
  "Account settings",
  "Secure access",
];

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { login } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@assetinsightvaluation.com";

  useEffect(() => {
    const emailParam = search.get("email");
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [search, email]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login({ email, password });
      if (result.authState !== "authenticated") {
        router.replace("/device-access");
      } else {
        const next = search.get("next");
        router.replace(next || "/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const isBlocked = (error || "").toLowerCase().includes("blocked");

  return (
    <AuthLightShell
      eyebrow="Client access"
      title="Asset Insight account access."
      description="Sign in to continue into reports, valuation workflows, saved activity, and your account tools."
      features={LOGIN_FEATURES}
    >
      <form
        onSubmit={onSubmit}
        className="ml-auto w-full max-w-xl rounded-[2rem] border border-white/60 bg-white/78 p-6 shadow-[0_30px_120px_rgba(15,23,42,0.14)] backdrop-blur-2xl sm:p-8"
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">
            Sign in
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Welcome back to your dashboard.
            </h2>
            <p className="hidden max-w-lg text-sm leading-6 text-slate-600 sm:block sm:text-base">
              Access valuations, workflows, and account tools from one clean entry point designed around clarity instead of bulky panels.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {isBlocked ? (
              <div className="space-y-1.5">
                <div className="font-semibold">Your account is blocked.</div>
                <div className="text-sm">
                  Please contact{" "}
                  <a className="font-medium underline underline-offset-4" href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>{" "}
                  for assistance.
                </div>
              </div>
            ) : (
              error
            )}
          </div>
        ) : null}

        <div className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Email address</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="h-14 w-full rounded-2xl border border-slate-200/80 bg-white/90 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                className="h-14 w-full rounded-2xl border border-slate-200/80 bg-white/90 pl-12 pr-14 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <button type="button" className="transition hover:text-red-600" onClick={() => router.push("/signup")}>
              Create account
            </button>
            <button type="button" className="transition hover:text-blue-600" onClick={() => router.push("/forgot-password")}>
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white transition hover:scale-[1.01] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span>{loading ? "Signing in..." : "Open dashboard"}</span>
            <ArrowRight className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
          </button>
        </div>
      </form>
    </AuthLightShell>
  );
}
