"use client";

import { StockOutForm } from "@/components/stock/StockOutForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export default function AppStockOutPage() {
  const { can, needsWarehousePicker, defaultWarehouseId, warehousesFor } =
    usePermissions();
  const requireWarehouse = needsWarehousePicker(Permission.STOCK_OUT);
  const allowedWarehouseIds = warehousesFor(Permission.STOCK_OUT);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Stock out"
        description="Record a direct sale to a client with one or more products. Use Transfer to send stock between warehouses."
      />

      {!can(Permission.STOCK_OUT) ? (
        <p className="text-sm text-zinc-500">
          You do not have stock-out permission.
        </p>
      ) : (
        <StockOutForm
          mode="sell"
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId()}
          allowedWarehouseIds={
            allowedWarehouseIds.length ? allowedWarehouseIds : undefined
          }
        />
      )}
    </div>
  );
}
