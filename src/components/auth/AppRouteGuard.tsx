"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import {
  canAccessAppPath,
  getDefaultAppPath,
  isAdminRole,
} from "@/lib/auth/permissions";

/**
 * Enforces module permissions on every /app route using the live AuthContext
 * user (DB-backed via /auth/me), not only the JWT snapshot in the edge proxy.
 */
export function AppRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const allowed =
    !!user &&
    !isAdminRole(user.role) &&
    canAccessAppPath(user.role, user.permissions, pathname);

  useEffect(() => {
    if (loading || !user || isAdminRole(user.role)) return;
    if (canAccessAppPath(user.role, user.permissions, pathname)) return;

    const dest = getDefaultAppPath(user.role, user.permissions);
    if (dest !== pathname) {
      router.replace(dest);
    }
  }, [user, loading, pathname, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner label="Checking access…" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner label="Redirecting…" />
      </div>
    );
  }

  return <>{children}</>;
}
