"use client";

import { useState } from "react";
import { AuthService } from "@/services/auth";
import { useRouter } from "next/navigation";
import { Hash, Loader2, Lock, Mail } from "lucide-react";
import { useAuthContext } from "@/context/AuthContext";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const { acceptAuthResponse } = useAuthContext();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"request" | "reset">("request");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (step === "request") {
        const res = await AuthService.forgotPassword({ email: normalizedEmail });
        setEmail(normalizedEmail);
        setStep("reset");
        setMessage(
          res.message || "If an account exists, a password reset code has been sent."
        );
      } else {
        if (!code.trim()) {
          setError("Enter the reset code sent to your email.");
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const res = await AuthService.resetPasswordByCode({
          email: normalizedEmail,
          code: code.trim(),
          password,
        });
        acceptAuthResponse(res);
        setMessage(res.message || "Password reset successful.");
        setTimeout(
          () => router.replace(res.authState === "authenticated" ? "/me" : "/device-access"),
          800
        );
      }
    } catch (err: any) {
      if (step === "request") {
        setMessage("If an account exists, a password reset code has been sent.");
      } else {
        setError(err?.message || "Failed to reset password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onResendCode = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await AuthService.forgotPassword({ email: normalizedEmail });
      setEmail(normalizedEmail);
      setMessage(res.message || "A new password reset code has been sent.");
    } catch {
      setMessage("If an account exists, a password reset code has been sent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-gray-200 bg-white/90 p-6 shadow-lg backdrop-blur"
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Reset Password</h1>
        <p className="text-sm text-gray-600">
          {step === "request"
            ? "Enter your email to receive a password reset code"
            : "Enter the code from your email and choose a new password"}
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-green-300 bg-green-50 p-2 text-sm text-green-700">
          {message}
        </div>
      )}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pl-10 text-sm shadow-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={step === "reset" || loading}
          />
        </div>
      </div>

      {step === "reset" && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Reset Code</label>
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pl-10 text-sm shadow-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pl-10 text-sm shadow-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pl-10 text-sm shadow-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                disabled={loading}
              />
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-red-500 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {step === "request" ? "Sending..." : "Updating..."}
          </>
        ) : (
          step === "request" ? "Send reset code" : "Update password"
        )}
      </button>
      {step === "reset" && (
        <button
          type="button"
          onClick={onResendCode}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Resend reset code
        </button>
      )}
      <div className="text-sm">
        Remembered your password?{" "}
        <button
          type="button"
          className="text-red-600 hover:underline"
          onClick={() => router.push("/login")}
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}
