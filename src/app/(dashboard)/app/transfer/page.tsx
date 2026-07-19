"use client";

import { TransferPanel } from "@/components/stock/TransferPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export default function AppTransferPage() {
  const { canAny, isAdmin, defaultWarehouseId } = usePermissions();

  const canUse = canAny([
    Permission.TRANSFERS_VIEW,
    Permission.TRANSFERS_RECEIVE,
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
          defaultWarehouseId={defaultWarehouseId()}
          showDestinationFilter={isAdmin}
        />
      )}
    </div>
  );
}
