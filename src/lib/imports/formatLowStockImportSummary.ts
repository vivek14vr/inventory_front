import { pluralizeStockUnit } from "@/lib/products/productUnits";
import type { WarehouseLowStockImportEntry } from "@/types/imports";

type LowStockImportRow = {
  lowStockThreshold?: number;
  baseUnit: string;
  stockUnit: string;
  unitsPerStockUnit: number;
};

/** Preview text for import rows: Excel low stock is in packs when pack size > 1. */
export function formatLowStockImportSummary(row: LowStockImportRow): string {
  if (row.lowStockThreshold == null) return "";

  const per = row.unitsPerStockUnit > 1 ? row.unitsPerStockUnit : 1;
  const baseLabel = pluralizeStockUnit(row.baseUnit || "piece", row.lowStockThreshold);

  if (per > 1) {
    const packs = row.lowStockThreshold / per;
    const packLabel = pluralizeStockUnit(row.stockUnit || "carton", packs);
    const packPart = Number.isInteger(packs)
      ? `${packs} ${packLabel}`
      : `${packs.toLocaleString()} ${packLabel}`;
    return `Low at ${packPart} (${row.lowStockThreshold.toLocaleString()} ${baseLabel})`;
  }

  return `Low at ${row.lowStockThreshold.toLocaleString()} ${baseLabel}`;
}

export function formatWarehouseLowStockImportSummary(
  thresholds: WarehouseLowStockImportEntry[] | undefined,
  row: LowStockImportRow
): string[] {
  if (!thresholds?.length) return [];

  return thresholds.map((entry) => {
    const summary = formatLowStockImportSummary({
      ...row,
      lowStockThreshold: entry.lowStockThreshold,
    });
    return `${entry.warehouseName}: ${summary}`;
  });
}
