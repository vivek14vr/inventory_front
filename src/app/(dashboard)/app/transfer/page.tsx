"use client";

import { TransferPanel } from "@/components/stock/TransferPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export default function AppTransferPage() {
  const { canAny, isAdmin, needsWarehousePicker, defaultWarehouseId, warehousesFor } =
    usePermissions();
  const requireWarehouse = needsWarehousePicker(Permission.STOCK_OUT);
  const allowedWarehouseIds = warehousesFor(Permission.STOCK_OUT);

  const canUse = canAny([
    Permission.STOCK_OUT,
    Permission.TRANSFERS_RECEIVE,
    Permission.TRANSFERS_VIEW,
    Permission.TRANSFERS_MANAGE,
  ]);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Transfer"
        description="Send stock from one warehouse to another, or receive incoming transfers."
      />

      {!canUse ? (
        <p className="text-sm text-zinc-500">
          You do not have transfer permission.
        </p>
      ) : (
        <TransferPanel
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId()}
          allowedWarehouseIds={
            allowedWarehouseIds.length ? allowedWarehouseIds : undefined
          }
          showDestinationFilter={isAdmin}
        />
      )}
    </div>
  );
}
