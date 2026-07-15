"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Loading from "@/components/common/Loading";
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
  const hasSession = hasStoredTokens();

  useEffect(() => {
    if (loading || loggingOut || (hasSession && user)) {
      return;
    }

    if (deviceAccess) {
      router.replace("/device-access");
      return;
    }

    const loginUrl = pathname
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

    router.replace(loginUrl);
  }, [deviceAccess, hasSession, loading, loggingOut, pathname, router, user]);

  if (loading || loggingOut) {
    return (
      <Loading
        message={loggingOut ? "Signing you out..." : "Checking your session..."}
        height={140}
        width={140}
        className="min-h-[50vh]"
      />
    );
  }

  if (deviceAccess || !hasSession || !user) {
    return (
      <Loading
        message={deviceAccess ? "Opening device access..." : "Redirecting to login..."}
        height={140}
        width={140}
        className="min-h-[50vh]"
      />
    );
  }

  return <>{children}</>;
}
