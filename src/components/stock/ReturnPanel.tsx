"use client";

import { useState } from "react";
import { ClientReturnPanel } from "@/components/stock/ClientReturnPanel";
import { WarehouseReturnPanel } from "@/components/stock/WarehouseReturnPanel";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { Alert } from "@/components/ui/Alert";

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
  const [source, setSource] = useState<ReturnSource>("choose");
  const [success, setSuccess] = useState("");

  function goBack() {
    setSource("choose");
  }

  if (source === "choose") {
    return (
      <div className="space-y-5">
        <Alert message={success} type="success" />
        <SelectionGrid
          title="Return from where?"
          subtitle="Client returns are tied to a sale invoice. Warehouse returns cover transfers between warehouses — received or still in transit."
          items={[
            {
              id: "client",
              title: "From client",
              subtitle: "Look up invoice · full or partial return",
            },
            {
              id: "warehouse",
              title: "From warehouse",
              subtitle: "Return accepted or in-transit transfers",
            },
          ]}
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
        <ClientReturnPanel
          defaultWarehouseId={defaultWarehouseId}
          onBack={goBack}
        />
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
