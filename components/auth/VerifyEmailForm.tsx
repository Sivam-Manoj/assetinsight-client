"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthService } from "@/services/auth";
import { useAuthContext } from "@/context/AuthContext";
import { Mail, Hash, Loader2 } from "lucide-react";

export default function VerifyEmailForm() {
  const router = useRouter();
  const { acceptAuthResponse } = useAuthContext();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // Safely read search params after mount to avoid hydration issues
  useEffect(() => {
    const emailParam = search.get("email");
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [search]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await AuthService.verifyEmail({
        email,
        verificationCode: code,
      });
      acceptAuthResponse(res);
      setMessage(res.message || "Email verified successfully.");
      setTimeout(() => {
        router.replace(
          res.authState === "authenticated" ? "/dashboard" : "/device-access"
        );
      }, 800);
    } catch (err: any) {
      setError(err?.message || "Failed to verify email");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await AuthService.resendVerificationCode(email);
      setMessage(res.message || "Verification code resent.");
    } catch (err: any) {
      setError(err?.message || "Failed to resend code");
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
        <h1 className="text-2xl font-semibold text-gray-900">Verify Email</h1>
        <p className="text-sm text-gray-600">Enter the code sent to your email</p>
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
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Verification Code</label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pl-10 text-sm shadow-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-red-500 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
          </>
        ) : (
          "Verify"
        )}
      </button>
      <button
        type="button"
        disabled={loading || !email}
        onClick={onResend}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
      >
        Didn&apos;t get a verification code? Resend verification code
      </button>
      <div className="text-sm">
        Already have an account?{" "}
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
