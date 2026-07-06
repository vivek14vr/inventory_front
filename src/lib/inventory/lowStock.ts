/** Mirrors backend low-stock comparison: both values are in base units. */
export function isWarehouseLowStock(row: {
  quantity: number;
  lowStockThreshold?: number | null;
}): boolean {
  if (row.lowStockThreshold == null || row.lowStockThreshold <= 0) return false;
  return row.quantity <= row.lowStockThreshold;
}

export function lowStockSourceLabel(row: {
  warehouseLowStockThreshold?: number | null;
}): "warehouse" | "default" | null {
  if (row.warehouseLowStockThreshold != null) return "warehouse";
  return "default";
}
