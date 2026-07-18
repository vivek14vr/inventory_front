"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ClientReturnPanel } from "@/components/stock/ClientReturnPanel";
import { StockFlowBackButton } from "@/components/stock/StockFlowBar";
import { WarehouseSelect } from "@/components/stock/WarehouseSelect";
import { shouldPickWarehouse, resolveWarehouseId } from "@/components/stock/stockFlowUtils";
import { Alert } from "@/components/ui/Alert";
import { hasPermission, hasPermissionSomewhere, Permission } from "@/lib/auth/permissions";

type ReturnPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  backHref?: string;
};

export function ReturnPanel({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  backHref,
}: ReturnPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const pickWarehouse = shouldPickWarehouse({ requireWarehouse, allowedWarehouseIds });
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    router.back();
  };

  const resolvedWarehouseId = resolveWarehouseId(
    warehouseId,
    defaultWarehouseId,
    allowedWarehouseIds
  );

  const canClientReturn = useMemo(() => {
    if (!user) return false;
    if (resolvedWarehouseId) {
      return hasPermission(
        user.role,
        user.permissions,
        Permission.RETURNS_CLIENT,
        resolvedWarehouseId
      );
    }
    if (allowedWarehouseIds?.length) {
      return allowedWarehouseIds.some((id) =>
        hasPermission(user.role, user.permissions, Permission.RETURNS_CLIENT, id)
      );
    }
    return hasPermissionSomewhere(
      user.role,
      user.permissions,
      Permission.RETURNS_CLIENT
    );
  }, [user, allowedWarehouseIds, resolvedWarehouseId]);

  if (pickWarehouse && !resolvedWarehouseId) {
    return (
      <div className="space-y-5">
        <StockFlowBackButton onClick={handleBack} />
        <div className="space-y-5 rounded-2xl border-2 border-stone-200 bg-white p-5">
          <h2 className="text-lg font-bold text-stone-900">Select warehouse</h2>
          <p className="text-sm text-stone-600">
            Choose which warehouse you are processing client returns for.
          </p>
          <WarehouseSelect
            value={warehouseId}
            onChange={setWarehouseId}
            allowedWarehouseIds={allowedWarehouseIds}
          />
        </div>
      </div>
    );
  }

  if (!canClientReturn) {
    return (
      <Alert message="You do not have permission to process client returns at this warehouse." />
    );
  }

  return <ClientReturnPanel defaultWarehouseId={resolvedWarehouseId} onBack={handleBack} />;
}
