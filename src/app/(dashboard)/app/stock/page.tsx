"use client";

import { Suspense } from "react";
import { StockOperationsPanel } from "@/components/stock/StockOperationsPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export default function AppStockPage() {
  const { can, needsWarehousePicker, defaultWarehouseId, warehousesFor } =
    usePermissions();
  const requireWarehouse = needsWarehousePicker(Permission.STOCK_IN);
  const allowedWarehouseIds = [
    ...new Set([
      ...warehousesFor(Permission.STOCK_IN),
      ...warehousesFor(Permission.STOCK_OUT),
      ...warehousesFor(Permission.STOCK_VIEW),
    ]),
  ];

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Stock operations"
        description="Stock in (add) or stock out (sell / transfer) — access is limited to warehouses assigned by your admin."
      />

      {!can(Permission.STOCK_IN) && !can(Permission.STOCK_OUT) ? (
        <p className="text-sm text-zinc-500">You do not have stock operation permissions.</p>
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          }
        >
          <StockOperationsPanel
            requireWarehouse={requireWarehouse}
            defaultWarehouseId={defaultWarehouseId()}
            allowedWarehouseIds={
              allowedWarehouseIds.length ? allowedWarehouseIds : undefined
            }
            canStockIn={can(Permission.STOCK_IN)}
            canStockOut={can(Permission.STOCK_OUT)}
          />
        </Suspense>
      )}
    </div>
  );
}
