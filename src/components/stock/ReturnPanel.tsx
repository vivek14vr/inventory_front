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

  const canClientReturn = useMemo(
    () =>
      hasAnyPermission(user?.role ?? "", user?.permissions, CLIENT_RETURN_PERMISSIONS),
    [user]
  );
  const canWarehouseReturn = useMemo(
    () =>
      hasAnyPermission(
        user?.role ?? "",
        user?.permissions,
        WAREHOUSE_RETURN_PERMISSIONS
      ),
    [user]
  );

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
