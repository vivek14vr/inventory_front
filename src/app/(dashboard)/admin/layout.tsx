"use client";

import { useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { isAdminRole } from "@/lib/auth/permissions";
import { getDashboardPath } from "@/lib/auth/token";

const navGroups = [
  {
    title: "Main menu",
    items: [
      { href: AUTH_ROUTES.adminDashboard, label: "Home" },
      { href: AUTH_ROUTES.adminStockIn, label: "Stock In" },
      { href: AUTH_ROUTES.adminStockOut, label: "Stock Out" },
      { href: AUTH_ROUTES.adminTransfer, label: "Transfer" },
      { href: AUTH_ROUTES.adminReturn, label: "Return" },
      { href: AUTH_ROUTES.adminInventory, label: "Check Stock" },
      { href: AUTH_ROUTES.adminInvoices, label: "Invoices" },
      { href: AUTH_ROUTES.adminReports, label: "Reports" },
    ],
  },
  {
    title: "More",
    items: [
      { href: AUTH_ROUTES.adminTransfers, label: "Transfer History" },
      { href: AUTH_ROUTES.adminImports, label: "Imports" },
      { href: AUTH_ROUTES.adminProducts, label: "Products" },
      { href: AUTH_ROUTES.adminWarehouses, label: "Warehouses" },
      { href: AUTH_ROUTES.adminBrands, label: "Brands" },
      { href: AUTH_ROUTES.adminClients, label: "Clients" },
      { href: AUTH_ROUTES.adminUsers, label: "Users" },
      { href: AUTH_ROUTES.adminChecklists, label: "Daily Checklists" },
      { href: AUTH_ROUTES.adminNotifications, label: "Notifications" },
      { href: AUTH_ROUTES.adminAudit, label: "Activity Log" },
    ],
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const loginUrl = new URL(AUTH_ROUTES.login, window.location.origin);
      loginUrl.searchParams.set("redirect", window.location.pathname);
      window.location.replace(loginUrl.pathname + loginUrl.search);
      return;
    }
    if (!isAdminRole(user.role)) {
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

  if (!isAdminRole(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner label="Redirecting…" />
      </div>
    );
  }

  return (
    <DashboardShell
      title="Stock Manager"
      subtitle="SV Enterprises"
      navGroups={navGroups}
      notificationsHref={AUTH_ROUTES.adminNotifications}
      checklistsHref={AUTH_ROUTES.adminChecklists}
    >
      {children}
    </DashboardShell>
  );
}
