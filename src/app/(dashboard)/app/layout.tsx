"use client";

import { useEffect, useMemo } from "react";
import { AppRouteGuard } from "@/components/auth/AppRouteGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { buildAppNavGroups } from "@/components/layout/buildAppNav";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { isAdminRole } from "@/lib/auth/permissions";
import { getDashboardPath } from "@/lib/auth/token";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  const navGroups = useMemo(
    () => buildAppNavGroups(user?.role ?? "", user?.permissions),
    [user]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const loginUrl = new URL(AUTH_ROUTES.login, window.location.origin);
      loginUrl.searchParams.set("redirect", window.location.pathname);
      window.location.replace(loginUrl.pathname + loginUrl.search);
      return;
    }
    if (isAdminRole(user.role)) {
      window.location.replace(getDashboardPath(user.role, user.permissions));
    }
  }, [user, loading]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  if (isAdminRole(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner label="Redirecting…" />
      </div>
    );
  }

  return (
    <DashboardShell
      title="Stock Manager"
      subtitle={user.name ?? "Operations"}
      navGroups={navGroups}
      notificationsHref={AUTH_ROUTES.appNotifications}
      checklistsHref={AUTH_ROUTES.appChecklists}
    >
      <AppRouteGuard>{children}</AppRouteGuard>
    </DashboardShell>
  );
}
