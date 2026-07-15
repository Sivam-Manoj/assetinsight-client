"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HardDrive,
  Laptop,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import {
  buildBasicDeviceContext,
  CameraVerificationError,
  type BrowserDeviceContext,
} from "@/lib/device-access";

function formatDate(value?: string) {
  if (!value) return "Today";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Today"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatStorage(context: BrowserDeviceContext | null) {
  const storage = context?.metadata.storage as
    | { availableBytes?: number; quotaBytes?: number }
    | undefined;
  if (typeof storage?.availableBytes !== "number") return "Browser quota available";
  const gb = storage.availableBytes / 1024 ** 3;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB browser quota available`;
}

export default function DeviceAccessView() {
  const router = useRouter();
  const {
    user,
    loading,
    deviceAccess,
    registerDevice,
    refreshDeviceStatus,
    rerequestDevice,
    logout,
  } = useAuthContext();
  const [context, setContext] = useState<BrowserDeviceContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    void buildBasicDeviceContext().then(setContext).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && !deviceAccess) {
      router.replace("/dashboard");
    } else if (!user && !deviceAccess) {
      router.replace("/login");
    }
  }, [deviceAccess, loading, router, user]);

  useEffect(() => {
    if (!deviceAccess || !["pending", "rerequest_pending"].includes(deviceAccess.authState)) {
      return;
    }
    let active = true;
    const poll = async () => {
      if (!active || document.visibilityState !== "visible") return;
      try {
        await refreshDeviceStatus();
        if (active) setManualError(null);
      } catch (error) {
        if (active) setManualError((error as Error).message || "Unable to refresh approval status.");
      }
    };
    const interval = window.setInterval(poll, 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [deviceAccess, refreshDeviceStatus]);

  const state = deviceAccess?.authState || "registration_required";
  const support = deviceAccess?.supportContact;
  const isRestricted = state === "rejected" || state === "revoked";
  const isBlocked = state === "ip_blocked";
  const pending = state === "pending" || state === "rerequest_pending";

  const presentation = useMemo(() => {
    if (state === "registration_required") {
      return {
        eyebrow: "Secure access",
        leftTitle: "Device approval required.",
        leftDescription:
          "This browser has not been approved for your account. Verify its camera details to send a request to your administrator.",
        title: "Allow camera access to continue",
        description:
          "Camera permission is required so your administrator can verify this device. If no camera is installed, we’ll record that automatically.",
        icon: <LockKeyhole className="h-14 w-14" strokeWidth={1.6} />,
      };
    }
    if (pending) {
      return {
        eyebrow: "Secure access",
        leftTitle: state === "rerequest_pending" ? "Review requested again." : "Approval request sent.",
        leftDescription:
          "This browser stays locked while an administrator reviews its device, camera, storage, and IP details.",
        title: state === "rerequest_pending" ? "Your new request is under review" : "Waiting for administrator approval",
        description: "You can leave this page open. Access unlocks automatically when the request is approved.",
        icon: <Clock3 className="h-14 w-14" strokeWidth={1.6} />,
      };
    }
    if (isBlocked) {
      return {
        eyebrow: "Secure access",
        leftTitle: "Access blocked for this network.",
        leftDescription:
          "An administrator blocked this IP address for your account. Device re-requests are unavailable until the address is unblocked.",
        title: "This IP address is blocked",
        description: "Contact your administrator using the support details below.",
        icon: <Ban className="h-14 w-14 text-red-600" strokeWidth={1.6} />,
      };
    }
    return {
      eyebrow: "Secure access",
      leftTitle: state === "revoked" ? "Device access revoked." : "Device request rejected.",
      leftDescription:
        state === "revoked"
          ? "Your administrator removed this browser installation’s access. Review the details and request another review if appropriate."
          : "Your administrator did not approve this browser installation. Review the details and contact support if you need help.",
      title: state === "revoked" ? "Access was revoked" : "Access was not approved",
      description: "You can request another review or contact your administrator.",
      icon: <XCircle className="h-14 w-14 text-red-600" strokeWidth={1.6} />,
    };
  }, [isBlocked, pending, state]);

  async function onRegister() {
    setBusy(true);
    setManualError(null);
    try {
      await registerDevice();
    } catch (error) {
      if (error instanceof CameraVerificationError) {
        setManualError(error.message);
      } else {
        setManualError((error as Error).message || "Unable to submit this device request.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setBusy(true);
    setManualError(null);
    try {
      await refreshDeviceStatus();
    } catch (error) {
      setManualError((error as Error).message || "Unable to refresh approval status.");
    } finally {
      setBusy(false);
    }
  }

  async function onRerequest() {
    setBusy(true);
    setManualError(null);
    try {
      await rerequestDevice();
    } catch (error: any) {
      setManualError(
        error?.response?.data?.message || error?.message || "Unable to request another review."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    await logout();
    router.replace("/login");
  }

  if (loading || (!deviceAccess && !user)) {
    return (
      <main className="device-access-shell grid min-h-screen place-items-center">
        <RefreshCw className="h-7 w-7 animate-spin text-slate-600" aria-label="Loading device access" />
      </main>
    );
  }

  return (
    <main className="device-access-shell relative min-h-screen overflow-hidden text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-[1480px] items-center gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(500px,0.82fr)] lg:gap-14 lg:px-14 xl:px-20">
        <section className="max-w-2xl py-3 lg:py-8">
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 overflow-hidden rounded-[1.65rem] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.09)] sm:h-24 sm:w-24 lg:h-28 lg:w-28">
              <Image src="/assentInsightLogo.jpeg" alt="Asset Insight" fill priority className="object-cover" />
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.38em] text-slate-500">Asset Insight</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{presentation.eyebrow}</p>
            </div>
          </div>

          <h1 className="mt-10 max-w-[12ch] text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:mt-14 lg:text-7xl">
            {presentation.leftTitle}
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            {presentation.leftDescription}
          </p>

          <div className="mt-9 max-w-xl divide-y divide-slate-300/80 text-sm font-semibold text-slate-600">
            {isRestricted || isBlocked ? (
              <>
                <div className="flex items-center gap-3 py-4"><Laptop className="h-5 w-5" /><span>{deviceAccess?.device?.displayName || (context ? `${valueText((context.metadata.browser as Record<string, unknown>)?.name, "Browser")} on ${valueText((context.metadata.os as Record<string, unknown>)?.name, "this device")}` : "Browser installation")}</span></div>
                <div className="flex items-center gap-3 py-4"><CalendarDays className="h-5 w-5" /><span>Requested {formatDate(deviceAccess?.device?.requestedAt)}</span></div>
                <div className="flex items-center gap-3 py-4"><HardDrive className="h-5 w-5" /><span>{formatStorage(context)}</span></div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 py-4"><Laptop className="h-5 w-5" /><span>{context ? `${valueText(context.metadata.os && (context.metadata.os as Record<string, unknown>).name, "Browser")} ${context.formFactor}` : "Browser installation"}</span></div>
                <div className="flex items-center gap-3 py-4"><ShieldCheck className="h-5 w-5" /><span>{pending ? "Administrator review in progress" : "Administrator review"}</span></div>
                <div className="flex items-center gap-3 py-4"><LockKeyhole className="h-5 w-5" /><span>Secure device-bound access</span></div>
              </>
            )}
          </div>
        </section>

        <section className="device-access-card ml-auto w-full max-w-[610px] rounded-[2rem] border border-white/75 bg-white/88 p-6 shadow-[0_34px_100px_rgba(15,23,42,0.13)] backdrop-blur-2xl sm:p-9 lg:p-11">
          <div className="text-slate-950">{presentation.icon}</div>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{presentation.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{presentation.description}</p>

          {state === "registration_required" ? (
            <div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white/70 text-sm">
              <div className="grid grid-cols-[120px_1fr] border-b border-slate-200 px-4 py-3"><span className="text-slate-500">Device</span><span className="font-medium text-slate-800">{context ? `${(context.metadata.os as Record<string, unknown>)?.name || "Browser"} ${context.formFactor}` : "Detecting…"}</span></div>
              <div className="grid grid-cols-[120px_1fr] border-b border-slate-200 px-4 py-3"><span className="text-slate-500">Browser</span><span className="font-medium text-slate-800">{context ? `${(context.metadata.browser as Record<string, unknown>)?.name || "Browser"} ${(context.metadata.browser as Record<string, unknown>)?.version || ""}` : "Detecting…"}</span></div>
              <div className="grid grid-cols-[120px_1fr] px-4 py-3"><span className="text-slate-500">Storage</span><span className="font-medium text-slate-800">{formatStorage(context)}</span></div>
            </div>
          ) : null}

          {pending ? (
            <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center gap-3"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" /><span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" /></span><span className="font-semibold text-slate-900">{state === "rerequest_pending" ? "Re-request pending" : "Request pending"}</span></div>
              <p className="mt-3 text-sm text-slate-600">Requested {formatDate(deviceAccess?.device?.requestedAt)} · Checked automatically every 10 seconds.</p>
            </div>
          ) : null}

          {isRestricted || isBlocked ? (
            <div className="mt-7 space-y-5">
              <div><p className="text-sm font-medium text-slate-700">Status</p><span className="mt-2 inline-flex rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold capitalize text-red-700">{state.replaceAll("_", " ")}</span></div>
              {deviceAccess?.reason ? <div><p className="text-sm font-medium text-slate-700">Administrator note</p><p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{deviceAccess.reason}</p></div> : null}
              {support ? <div className="border-t border-slate-200 pt-5"><p className="text-sm font-medium text-slate-700">Need help?</p><div className="mt-3 space-y-2.5 text-sm text-slate-600">{support.name ? <div className="flex items-center gap-3"><UserRound className="h-4 w-4" /><span>{support.name}</span></div> : null}{support.email ? <a className="flex items-center gap-3 hover:text-red-600" href={`mailto:${support.email}`}><Mail className="h-4 w-4" /><span>{support.email}</span></a> : null}{support.phone ? <a className="flex items-center gap-3 hover:text-red-600" href={`tel:${support.phone}`}><Phone className="h-4 w-4" /><span>{support.phone}</span></a> : null}</div></div> : null}
            </div>
          ) : null}

          {manualError ? (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><p>{manualError}</p>{state === "registration_required" ? <button type="button" className="mt-1 font-semibold underline underline-offset-4" onClick={() => void onRegister()}>Try again</button> : null}</div></div>
          ) : null}

          <div className="mt-7 space-y-3">
            {state === "registration_required" ? <button type="button" disabled={busy} onClick={() => void onRegister()} className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:opacity-60"><Video className="h-5 w-5" />{busy ? "Checking camera…" : "Allow camera access"}</button> : null}
            {pending ? <button type="button" disabled={busy} onClick={() => void onRefresh()} className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:opacity-60"><RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />{busy ? "Checking…" : "Check status now"}</button> : null}
            {isRestricted ? <button type="button" disabled={busy} onClick={() => void onRerequest()} className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:opacity-60"><CheckCircle2 className="h-5 w-5" />{busy ? "Sending request…" : "Request again"}</button> : null}
            <button type="button" disabled={busy} onClick={() => void onSignOut()} className="inline-flex h-12 w-full items-center justify-center rounded-full border border-slate-200 bg-white/70 px-6 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-300/30 disabled:opacity-60">Sign out</button>
          </div>

          {state === "registration_required" ? <div className="mt-6 flex items-start gap-3 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>Camera details are collected for access review. No photo or video is saved, and raw browser media-device IDs are never retained. See our <Link href="/privacy" className="font-semibold underline underline-offset-2 hover:text-slate-800">privacy notice</Link>.</p></div> : null}
          {isRestricted ? <p className="mt-6 text-sm text-slate-500">Re-requests are limited to 5 in a rolling 24-hour period.</p> : null}
          {isBlocked ? <p className="mt-6 text-sm text-slate-500">IP blocks are exact-address and specific to your account.</p> : null}
        </section>
      </div>
    </main>
  );
}

function valueText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}
