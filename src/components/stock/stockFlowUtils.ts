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
  if (warehouseId) return warehouseId;
  if (defaultWarehouseId) return defaultWarehouseId;
  if (allowedWarehouseIds?.length === 1) return allowedWarehouseIds[0];
  return "";
}
