"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { hasStoredTokens } from "@/lib/auth-storage";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, loggingOut, deviceAccess } = useAuthContext();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(true);

  useEffect(() => {
    setHasSession(hasStoredTokens());
    setSessionChecked(true);
  }, [deviceAccess, loading, user]);

  useEffect(() => {
    if (!sessionChecked || loading || loggingOut || user) return;
    if (deviceAccess) {
      router.replace("/device-access");
      return;
    }
    if (!hasSession) {
      const loginUrl = `/login?next=${encodeURIComponent(pathname || "/dashboard")}`;
      router.replace(loginUrl);
    }
  }, [
    deviceAccess,
    hasSession,
    loading,
    loggingOut,
    pathname,
    router,
    sessionChecked,
    user,
  ]);

  if (
    deviceAccess ||
    (sessionChecked && !loading && !hasSession && !user)
  ) {
    return (
      <div className="app-page" role="status" aria-live="polite">
        <div className="app-surface app-section" style={{ minHeight: 180 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="app-spinner" aria-hidden />
            <span className="app-muted">
              {deviceAccess ? "Opening device access…" : "Opening sign in…"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
