"use client";

import { ReturnPanel } from "@/components/stock/ReturnPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { getPrimaryWarehouseId } from "@/lib/auth/warehouseContext";

export default function AppReturnPage() {
  const { user } = useAuth();
  const warehouseId = getPrimaryWarehouseId(user) ?? "";

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Return"
        description="Record goods returned from a client or send stock back to another warehouse."
      />
      <ReturnPanel
        defaultWarehouseId={warehouseId}
        allowedWarehouseIds={warehouseId ? [warehouseId] : undefined}
      />
    </div>
  );
}
