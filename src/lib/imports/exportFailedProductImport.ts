import * as XLSX from "xlsx";
import type { ProductImportResult, ProductImportResultRow } from "@/types/imports";

function lowQuantityCarton(row: ProductImportResultRow): number | "" {
  if (row.lowStockThreshold == null) return "";
  const per = row.unitsPerStockUnit ?? 1;
  if (per > 1) {
    return Math.round(row.lowStockThreshold / per);
  }
  return row.lowStockThreshold;
}

export function downloadFailedProductImportExcel(
  result: ProductImportResult,
  sourceFileName?: string
) {
  const failed = result.rows.filter((row) => row.status === "FAILED");
  if (failed.length === 0) return;

  const sheetRows = failed.map((row) => ({
    brand: row.brandName,
    "product primary name": row.primaryName,
    "product secondary name": row.secondaryName ?? "",
    unit: row.baseUnit ?? "",
    "units in a cartoon": row.unitsPerStockUnit ?? 1,
    "low quantity cartoon": lowQuantityCarton(row),
    "brand action": row.brandAction ?? "",
    "merge target brand id": row.mergeTargetBrandId ?? "",
    "product action": row.action,
    "merge target product id": row.mergeTargetProductId ?? "",
    "error message": row.message ?? "",
    "excel row": row.rowNumber,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Failed rows");

  const baseName = sourceFileName?.replace(/\.(xlsx|xls|csv)$/i, "") ?? "product-import";
  XLSX.writeFile(workbook, `${baseName}-failed.xlsx`);
}
