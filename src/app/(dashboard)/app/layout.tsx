"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { buildAppNavGroups } from "@/components/layout/buildAppNav";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const navGroups = useMemo(
    () => buildAppNavGroups(user?.role ?? "", user?.permissions),
    [user]
  );

  return (
    <DashboardShell
      title="Stock Manager"
      subtitle={user?.name ?? "Operations"}
      navGroups={navGroups}
      notificationsHref={AUTH_ROUTES.appNotifications}
      checklistsHref={AUTH_ROUTES.appChecklists}
    >
      {children}
    </DashboardShell>
  );
}
