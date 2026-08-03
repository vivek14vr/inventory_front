import * as XLSX from "xlsx";
import {
  buildProductImportWorkbook,
  downloadProductImportExcel,
} from "./exportFailedProductImport";
import {
  buildSalesImportReportWorkbook,
  downloadSalesImportReport,
} from "./exportSalesImportReport";
import type {
  ClientImportResult,
  ImportLogDetail,
  ProductImportResult,
  SalesImportResult,
} from "@/types/imports";

function safeBaseName(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[^a-z0-9._-]+/gi, "-");
}

function buildClientImportWorkbook(
  result: ClientImportResult,
  sourceFileName: string
): { workbook: XLSX.WorkBook; fileName: string } {
  const rows = result.rows.map((row) => ({
    "Excel row": row.rowNumber,
    "Client name": row.primaryName,
    Action: row.action,
    Status: row.status,
    Message: row.message ?? "",
    "Client ID": row.clientId ?? "",
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Import results");
  return {
    workbook,
    fileName: `${safeBaseName(sourceFileName) || "client-import"}-import-results.xlsx`,
  };
}

export function createGeneratedImportReportFile(
  kind: "products" | "sales" | "clients",
  result: ProductImportResult | SalesImportResult | ClientImportResult,
  sourceFileName: string
): File {
  const built =
    kind === "sales"
      ? buildSalesImportReportWorkbook(result as SalesImportResult, sourceFileName)
      : kind === "products"
        ? buildProductImportWorkbook(result as ProductImportResult, sourceFileName)
        : buildClientImportWorkbook(result as ClientImportResult, sourceFileName);
  const bytes = XLSX.write(built.workbook, {
    type: "array",
    bookType: "xlsx",
    cellDates: true,
  }) as ArrayBuffer;
  return new File([bytes], built.fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadImportLogExcel(log: ImportLogDetail): void {
  if (log.kind === "sales") {
    downloadSalesImportReport(log.result as SalesImportResult, log.fileName);
    return;
  }
  if (log.kind === "products") {
    downloadProductImportExcel(log.result as ProductImportResult, log.fileName);
    return;
  }

  const built = buildClientImportWorkbook(log.result as ClientImportResult, log.fileName);
  XLSX.writeFile(built.workbook, built.fileName);
}
