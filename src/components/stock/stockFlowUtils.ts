import type { PendingTransfer } from "@/types/stock";

export function shouldPickWarehouse(options: {
  requireWarehouse?: boolean;
  allowedWarehouseIds?: string[];
  transfer?: PendingTransfer;
}): boolean {
  if (options.transfer) return false;
  if (options.requireWarehouse) return true;
  if (options.allowedWarehouseIds && options.allowedWarehouseIds.length > 1) {
    return true;
  }
  return false;
}

export function resolveWarehouseId(
  warehouseId: string,
  defaultWarehouseId: string,
  allowedWarehouseIds?: string[]
): string {
  const allowed =
    allowedWarehouseIds && allowedWarehouseIds.length > 0
      ? new Set(allowedWarehouseIds)
      : null;

  if (warehouseId && (!allowed || allowed.has(warehouseId))) {
    return warehouseId;
  }
  if (defaultWarehouseId && (!allowed || allowed.has(defaultWarehouseId))) {
    return defaultWarehouseId;
  }
  if (allowedWarehouseIds?.length === 1) return allowedWarehouseIds[0];
  if (allowedWarehouseIds?.length) return allowedWarehouseIds[0] ?? "";
  return "";
}
