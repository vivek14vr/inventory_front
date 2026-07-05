"use client";

import { StockInForm } from "@/components/stock/StockInForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export default function AppStockInPage() {
  const { can, needsWarehousePicker, defaultWarehouseId, warehousesFor } =
    usePermissions();
  const requireWarehouse = needsWarehousePicker(Permission.STOCK_IN);
  const allowedWarehouseIds = warehousesFor(Permission.STOCK_IN);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Stock in"
        description="Add stock into a warehouse — tap to pick brand and product."
      />

      {!can(Permission.STOCK_IN) ? (
        <p className="text-sm text-zinc-500">
          You do not have stock-in permission.
        </p>
      ) : (
        <StockInForm
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
