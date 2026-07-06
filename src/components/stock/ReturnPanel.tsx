"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ClientReturnPanel } from "@/components/stock/ClientReturnPanel";
import { WarehouseReturnPanel } from "@/components/stock/WarehouseReturnPanel";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { Alert } from "@/components/ui/Alert";
import {
  CLIENT_RETURN_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  Permission,
  WAREHOUSE_RETURN_PERMISSIONS,
} from "@/lib/auth/permissions";

type ReturnSource = "choose" | "client" | "warehouse";

type ReturnPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
};

export function ReturnPanel({
  defaultWarehouseId = "",
  allowedWarehouseIds,
}: ReturnPanelProps) {
  const { user } = useAuth();
  const [source, setSource] = useState<ReturnSource>("choose");
  const [success, setSuccess] = useState("");

  const canClientReturn = useMemo(() => {
    if (!user) return false;
    if (allowedWarehouseIds?.length) {
      return allowedWarehouseIds.some((warehouseId) =>
        CLIENT_RETURN_PERMISSIONS.some((code) =>
          hasPermission(user.role, user.permissions, code, warehouseId)
        )
      );
    }
    if (defaultWarehouseId) {
      return CLIENT_RETURN_PERMISSIONS.some((code) =>
        hasPermission(user.role, user.permissions, code, defaultWarehouseId)
      );
    }
    return hasAnyPermission(user.role, user.permissions, CLIENT_RETURN_PERMISSIONS);
  }, [user, allowedWarehouseIds, defaultWarehouseId]);

  const canWarehouseReturn = useMemo(() => {
    if (!user) return false;
    if (allowedWarehouseIds?.length) {
      return allowedWarehouseIds.some((warehouseId) =>
        WAREHOUSE_RETURN_PERMISSIONS.filter(
          (code) => code !== Permission.TRANSFERS_MANAGE
        ).some((code) =>
          hasPermission(user.role, user.permissions, code, warehouseId)
        ) || hasPermission(user.role, user.permissions, Permission.TRANSFERS_MANAGE)
      );
    }
    if (defaultWarehouseId) {
      return (
        WAREHOUSE_RETURN_PERMISSIONS.filter(
          (code) => code !== Permission.TRANSFERS_MANAGE
        ).some((code) =>
          hasPermission(user.role, user.permissions, code, defaultWarehouseId)
        ) || hasPermission(user.role, user.permissions, Permission.TRANSFERS_MANAGE)
      );
    }
    return hasAnyPermission(
      user.role,
      user.permissions,
      WAREHOUSE_RETURN_PERMISSIONS
    );
  }, [user, allowedWarehouseIds, defaultWarehouseId]);

  function goBack() {
    setSource("choose");
  }

  if (!canClientReturn && !canWarehouseReturn) {
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
      ...(canWarehouseReturn
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
      <div className="space-y-5">
        <Alert message={success} type="success" />
        <SelectionGrid
          title="Return from where?"
          subtitle="Client returns correct sold quantities on an invoice. Warehouse returns send transfer stock back to the source."
          items={items}
          onSelect={(id) => {
            setSuccess("");
            setSource(id === "client" ? "client" : "warehouse");
          }}
        />
      </div>
    );
  }

  if (source === "client") {
    return (
      <div className="space-y-5">
        <Alert message={success} type="success" />
        <ClientReturnPanel defaultWarehouseId={defaultWarehouseId} onBack={goBack} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Alert message={success} type="success" />
      <WarehouseReturnPanel
        defaultWarehouseId={defaultWarehouseId}
        allowedWarehouseIds={allowedWarehouseIds}
        onBack={goBack}
      />
    </div>
  );
}
