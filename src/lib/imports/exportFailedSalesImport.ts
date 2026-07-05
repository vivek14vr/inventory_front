import * as XLSX from "xlsx";
import type { SalesImportResult, SalesImportResultLine } from "@/types/imports";

export function downloadFailedSalesImportExcel(
  result: SalesImportResult,
  sourceFileName?: string
) {
  const failed = result.rows.filter((row) => row.status === "FAILED");
  if (failed.length === 0) return;

  const sheetRows = failed.map((row: SalesImportResultLine) => ({
    date: row.sellDate,
    client: row.clientName,
    "invoice number": row.invoiceNumber,
    product: row.productName,
    quantity: row.quantity,
    "merge target product id": row.mergeTargetProductId ?? "",
    "error message": row.message ?? "",
    "excel row": row.rowNumber,
    "voucher row": row.headerRowNumber,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Failed rows");

  const baseName = sourceFileName?.replace(/\.(xlsx|xls|csv)$/i, "") ?? "sales-import";
  XLSX.writeFile(workbook, `${baseName}-failed.xlsx`);
}
