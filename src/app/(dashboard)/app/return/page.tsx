"use client";

import { ReturnPanel } from "@/components/stock/ReturnPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { getPrimaryWarehouseId } from "@/lib/auth/warehouseContext";

export default function AppReturnPage() {
  const { user } = useAuth();
  const warehouseId = getPrimaryWarehouseId(user) ?? "";

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Return"
        description="Record goods returned from a client by updating sold quantities on an invoice."
      />
      <ReturnPanel
        defaultWarehouseId={warehouseId}
        allowedWarehouseIds={warehouseId ? [warehouseId] : undefined}
        backHref={AUTH_ROUTES.appDashboard}
      />
    </div>
  );
}
