import * as XLSX from "xlsx";
import type { ProductImportResult, ProductImportResultRow } from "@/types/imports";

function splitLowStockForExport(
  threshold: number | undefined,
  unitsPerStockUnit: number
): { cartoon: number | ""; unit: number | "" } {
  if (threshold == null) return { cartoon: "", unit: "" };
  const per = unitsPerStockUnit > 1 ? unitsPerStockUnit : 1;
  if (per > 1 && threshold % per === 0) {
    return { cartoon: threshold / per, unit: "" };
  }
  return { cartoon: "", unit: threshold };
}

function warehouseLowStockColumns(
  row: ProductImportResultRow
): Record<string, number | ""> {
  const per = row.unitsPerStockUnit ?? 1;
  const columns: Record<string, number | ""> = {};

  for (const entry of row.warehouseLowStockThresholds ?? []) {
    const split = splitLowStockForExport(entry.lowStockThreshold, per);
    columns[`low quantity cartoon in ${entry.warehouseName}`] = split.cartoon;
    columns[`low quantity unit in ${entry.warehouseName}`] = split.unit;
  }

  return columns;
}

export function downloadFailedProductImportExcel(
  result: ProductImportResult,
  sourceFileName?: string
) {
  const failed = result.rows.filter((row) => row.status === "FAILED");
  if (failed.length === 0) return;

  const sheetRows = failed.map((row) => {
    const per = row.unitsPerStockUnit ?? 1;
    const totalLow = splitLowStockForExport(row.totalLowStockThreshold, per);
    const defaultLow = splitLowStockForExport(row.lowStockThreshold, per);
    return {
      brand: row.brandName,
      "product primary name": row.primaryName,
      "product secondary name": row.secondaryName ?? "",
      unit: row.baseUnit ?? "",
      "units in a cartoon": per,
      "total low quantity cartoon": totalLow.cartoon,
      "total low quantity unit": totalLow.unit,
      "low quantity cartoon": defaultLow.cartoon,
      "low quantity unit": defaultLow.unit,
      ...warehouseLowStockColumns(row),
      "brand action": row.brandAction ?? "",
      "merge target brand id": row.mergeTargetBrandId ?? "",
      "product action": row.action,
      "merge target product id": row.mergeTargetProductId ?? "",
      "error message": row.message ?? "",
      "excel row": row.rowNumber,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Failed rows");

  const baseName = sourceFileName?.replace(/\.(xlsx|xls|csv)$/i, "") ?? "product-import";
  XLSX.writeFile(workbook, `${baseName}-failed.xlsx`);
}
