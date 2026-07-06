"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ClientReturnPanel } from "@/components/stock/ClientReturnPanel";
import { WarehouseReturnPanel } from "@/components/stock/WarehouseReturnPanel";
import { WarehouseSelect } from "@/components/stock/WarehouseSelect";
import { shouldPickWarehouse, resolveWarehouseId } from "@/components/stock/stockFlowUtils";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { Alert } from "@/components/ui/Alert";
import {
  CLIENT_RETURN_PERMISSIONS,
  canWarehouseReturn,
  hasPermission,
} from "@/lib/auth/permissions";

type ReturnSource = "choose" | "client" | "warehouse";

type ReturnPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
};

export function ReturnPanel({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
}: ReturnPanelProps) {
  const { user } = useAuth();
  const pickWarehouse = shouldPickWarehouse({ requireWarehouse, allowedWarehouseIds });
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [source, setSource] = useState<ReturnSource>("choose");

  const resolvedWarehouseId = resolveWarehouseId(
    warehouseId,
    defaultWarehouseId,
    allowedWarehouseIds
  );

  const canClientReturn = useMemo(() => {
    if (!user) return false;
    if (resolvedWarehouseId) {
      return CLIENT_RETURN_PERMISSIONS.some((code) =>
        hasPermission(user.role, user.permissions, code, resolvedWarehouseId)
      );
    }
    if (allowedWarehouseIds?.length) {
      return allowedWarehouseIds.some((id) =>
        CLIENT_RETURN_PERMISSIONS.some((code) =>
          hasPermission(user.role, user.permissions, code, id)
        )
      );
    }
    return CLIENT_RETURN_PERMISSIONS.some((code) =>
      hasPermission(user.role, user.permissions, code)
    );
  }, [user, allowedWarehouseIds, resolvedWarehouseId]);

  const canWarehouseReturnAccess = useMemo(
    () =>
      canWarehouseReturn(user?.role ?? "", user?.permissions, resolvedWarehouseId || undefined),
    [user, resolvedWarehouseId]
  );

  function goBack() {
    setSource("choose");
  }

  if (pickWarehouse && !resolvedWarehouseId) {
    return (
      <div className="space-y-5 rounded-2xl border-2 border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">Select warehouse</h2>
        <p className="text-sm text-stone-600">
          Choose which warehouse you are processing returns for.
        </p>
        <WarehouseSelect
          value={warehouseId}
          onChange={setWarehouseId}
          allowedWarehouseIds={allowedWarehouseIds}
        />
      </div>
    );
  }

  if (!canClientReturn && !canWarehouseReturnAccess) {
    return (
      <Alert message="You do not have permission to process returns at this warehouse." />
    );
  }

  if (source === "choose") {
    const items = [
      ...(canClientReturn
        ? [
            {
              id: "client",
              title: "From client",
              subtitle: "Open invoice · update sold quantity",
            },
          ]
        : []),
      ...(canWarehouseReturnAccess
        ? [
            {
              id: "warehouse",
              title: "From warehouse",
              subtitle: "Return received or in-transit transfers",
            },
          ]
        : []),
    ];

    return (
      <SelectionGrid
        title="Return from where?"
        subtitle="Client returns correct sold quantities on an invoice. Warehouse returns send transfer stock back to the source."
        items={items}
        onSelect={(id) => {
          setSource(id === "client" ? "client" : "warehouse");
        }}
      />
    );
  }

  if (source === "client") {
    return (
      <ClientReturnPanel
        defaultWarehouseId={resolvedWarehouseId}
        onBack={goBack}
      />
    );
  }

  return (
    <WarehouseReturnPanel
      defaultWarehouseId={resolvedWarehouseId}
      allowedWarehouseIds={allowedWarehouseIds}
      onBack={goBack}
    />
  );
}
