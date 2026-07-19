"use client";

import { useMemo } from "react";
import { ReturnPanel } from "@/components/stock/ReturnPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { Permission } from "@/lib/auth/permissions";

export default function AppReturnPage() {
  const { isAdmin, warehousesFor, defaultWarehouseId } = usePermissions();

  const allowedWarehouseIds = useMemo(() => {
    if (isAdmin) return undefined;
    return warehousesFor(Permission.RETURNS_CLIENT);
  }, [isAdmin, warehousesFor]);

  const defaultId = useMemo(() => {
    const primary = defaultWarehouseId();
    if (isAdmin) return primary;
    if (allowedWarehouseIds?.includes(primary)) return primary;
    return allowedWarehouseIds?.[0] ?? "";
  }, [isAdmin, allowedWarehouseIds, defaultWarehouseId]);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Return"
        description="Record goods returned from a client by updating sold quantities on an invoice."
      />
      <ReturnPanel
        defaultWarehouseId={defaultId}
        allowedWarehouseIds={allowedWarehouseIds}
        requireWarehouse={isAdmin || (allowedWarehouseIds?.length ?? 0) !== 1}
        backHref={AUTH_ROUTES.appDashboard}
      />
    </div>
  );
}
