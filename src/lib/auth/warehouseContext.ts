import {
  hasPermission,
  isWarehouseScopedPermission,
  Permission,
  type PermissionCode,
} from "@/lib/auth/permissions";
import type { AuthUser } from "@/types/auth";

/** Primary warehouse for scoped operations (profile field or first permission grant). */
export function getPrimaryWarehouseId(user: AuthUser | null | undefined): string | undefined {
  if (!user) return undefined;
  if (user.warehouseId) return user.warehouseId;
  if (user.warehouse?.id) return user.warehouse.id;

  const grants = user.permissions ?? [];
  for (const code of [
    Permission.STOCK_VIEW,
    Permission.STOCK_MOVEMENTS,
    Permission.STOCK_LOW,
    Permission.STOCK_IN,
    Permission.INVENTORY_VIEW,
    Permission.TRANSFERS_VIEW,
    Permission.TRANSFERS_RECEIVE,
  ] as PermissionCode[]) {
    const grant = grants.find((g) => g.code === code && g.warehouseId);
    if (grant?.warehouseId) return grant.warehouseId;
  }

  const anyScoped = grants.find(
    (g) => isWarehouseScopedPermission(g.code) && g.warehouseId
  );
  return anyScoped?.warehouseId;
}

export function getWarehouseLabel(
  user: AuthUser | null | undefined,
  authLoading?: boolean
): string {
  if (authLoading) return "Loading…";
  if (!user) return "Signed in";
  if (user.warehouse) {
    return `${user.warehouse.name} (${user.warehouse.code})`;
  }

  const warehouseId = getPrimaryWarehouseId(user);
  if (warehouseId) return "Your warehouse";

  return "No warehouse assigned";
}

export function canViewStockDashboard(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const warehouseId = getPrimaryWarehouseId(user);
  return hasPermission(user.role, user.permissions, Permission.STOCK_VIEW, warehouseId);
}

export function canViewPendingTransfers(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const warehouseId = getPrimaryWarehouseId(user);
  return (
    hasPermission(user.role, user.permissions, Permission.TRANSFERS_RECEIVE, warehouseId) ||
    hasPermission(user.role, user.permissions, Permission.TRANSFERS_MANAGE, warehouseId)
  );
}
