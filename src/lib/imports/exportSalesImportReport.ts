import * as XLSX from "xlsx";
import type {
  SalesImportResult,
  SalesImportResultLine,
} from "@/types/imports";

function reportStatus(result: SalesImportResult): string {
  const skipped = result.rows.filter((row) => row.status === "SKIPPED").length;
  if (result.failedCount > 0 && result.successCount > 0) return "PARTIAL SUCCESS";
  if (result.failedCount > 0 && result.successCount === 0) return "FAILURE";
  if (skipped > 0) return "COMPLETED WITH SKIPPED ROWS";
  return "SUCCESS";
}

function displayStatus(status: string): string {
  return status === "FAILED" ? "FAILURE" : status;
}

function formatDuration(durationMs?: number): string {
  if (durationMs == null || !Number.isFinite(durationMs)) return "";
  if (durationMs < 1_000) return `${durationMs} ms`;
  const totalSeconds = Math.round(durationMs / 100) / 10;
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} min ${seconds} sec`;
}

function readableTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN");
}

function parseDate(value?: string): Date | string {
  if (!value) return "";
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.trim().match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2}|\d{4})$/);
  if (!match) return value;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(match[2].toLowerCase());
  if (month < 0) return value;
  const shortYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + shortYear : shortYear;
  return new Date(year, month, Number(match[1]));
}

function processedDate(value?: string): Date | string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function setColumnWidths(worksheet: XLSX.WorkSheet, widths: number[]): void {
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
}

function applyDateFormats(
  sheet: XLSX.WorkSheet,
  dataStartRow: number,
  dataEndRow: number,
  dateColumns: number[],
  timeColumns: number[] = []
): void {
  for (let row = dataStartRow; row <= dataEndRow; row += 1) {
    for (const column of dateColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell?.v instanceof Date) cell.z = "dd-mmm-yy";
    }
    for (const column of timeColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell?.v instanceof Date) cell.z = "hh:mm:ss AM/PM";
    }
  }
}

function warehouseLabel(
  row: SalesImportResultLine,
  warehouseById: Map<string, { id: string; name: string; code: string }>
): string {
  const warehouse = row.warehouseId ? warehouseById.get(row.warehouseId) : undefined;
  return warehouse ? `${warehouse.name} (${warehouse.code})` : "";
}

function buildSalesRegisterSheet(
  result: SalesImportResult,
  warehouseById: Map<string, { id: string; name: string; code: string }>
): XLSX.WorkSheet {
  const headers = [
    "Date",
    "Particulars",
    "Brand",
    "Voucher Type",
    "Voucher No.",
    "Warehouse",
    "Quantity",
    "Status",
    "Message",
    "Import Date",
    "Import Time",
  ];
  const tableRows: Array<Array<string | number | Date>> = [];

  for (const voucher of result.vouchers) {
    const voucherRows = result.rows.filter((row) => row.voucherIndex === voucher.voucherIndex);
    const importedQuantity = voucherRows
      .filter((row) => row.status === "SUCCESS")
      .reduce((sum, row) => sum + row.quantity, 0);
    const voucherProcessedAt = processedDate(voucher.processedAt ?? result.completedAt);
    tableRows.push([
      parseDate(voucher.sellDate),
      voucher.clientName,
      "",
      "Sales",
      voucher.invoiceNumber,
      "",
      importedQuantity,
      displayStatus(voucher.status),
      voucher.message ?? "",
      voucherProcessedAt,
      voucherProcessedAt,
    ]);

    for (const row of voucherRows) {
      const rowProcessedAt = processedDate(row.processedAt ?? result.completedAt);
      tableRows.push([
        "",
        `    ${row.productName}`,
        row.brandName ?? "",
        "",
        "",
        warehouseLabel(row, warehouseById),
        row.quantity,
        displayStatus(row.status),
        row.message ?? "",
        rowProcessedAt,
        rowProcessedAt,
      ]);
    }
  }

  const periodDates = result.vouchers
    .map((voucher) => parseDate(voucher.sellDate))
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());
  const period = periodDates.length
    ? `${periodDates[0].toLocaleDateString("en-IN")} to ${periodDates[periodDates.length - 1].toLocaleDateString("en-IN")}`
    : "Imported sales invoices";
  const matrix: Array<Array<string | number | Date>> = [
    ["Sales Register"],
    [period],
    [],
    headers,
    ...tableRows,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(matrix, { cellDates: true });
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
  ];
  sheet["!autofilter"] = { ref: `A4:K${Math.max(4, tableRows.length + 4)}` };
  setColumnWidths(sheet, [14, 34, 24, 15, 16, 26, 12, 16, 62, 14, 16]);
  applyDateFormats(sheet, 5, tableRows.length + 4, [1, 10], [11]);
  return sheet;
}

function buildImportStatusSheet(
  result: SalesImportResult,
  warehouseById: Map<string, { id: string; name: string; code: string }>
): XLSX.WorkSheet {
  const statusRows: Array<Record<string, string | number | Date>> = [];
  for (const voucher of result.vouchers) {
    statusRows.push({
      Level: "INVOICE",
      "Excel row": voucher.headerRowNumber,
      "Invoice date": parseDate(voucher.sellDate),
      Client: voucher.clientName,
      "Invoice number": voucher.invoiceNumber,
      Product: "",
      Brand: "",
      Quantity: "",
      Warehouse: "",
      Status: displayStatus(voucher.status),
      Message: voucher.message ?? "",
      "Processed date/time": processedDate(voucher.processedAt ?? result.completedAt),
    });
  }
  for (const row of result.rows) {
    statusRows.push({
      Level: "PRODUCT",
      "Excel row": row.rowNumber,
      "Invoice date": parseDate(row.sellDate),
      Client: row.clientName,
      "Invoice number": row.invoiceNumber,
      Product: row.productName,
      Brand: row.brandName ?? "",
      Quantity: row.quantity,
      Warehouse: warehouseLabel(row, warehouseById),
      Status: displayStatus(row.status),
      Message: row.message ?? "",
      "Processed date/time": processedDate(row.processedAt ?? result.completedAt),
    });
  }

  const sheet = XLSX.utils.json_to_sheet(statusRows, {
    cellDates: true,
    header: [
      "Level",
      "Excel row",
      "Invoice date",
      "Client",
      "Invoice number",
      "Product",
      "Brand",
      "Quantity",
      "Warehouse",
      "Status",
      "Message",
      "Processed date/time",
    ],
  });
  sheet["!autofilter"] = { ref: `A1:L${Math.max(1, statusRows.length + 1)}` };
  setColumnWidths(sheet, [12, 12, 14, 28, 18, 34, 24, 12, 26, 16, 68, 24]);
  applyDateFormats(sheet, 2, statusRows.length + 1, [3]);
  for (let row = 2; row <= statusRows.length + 1; row += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 11 })];
    if (cell?.v instanceof Date) cell.z = "dd-mmm-yy hh:mm:ss AM/PM";
  }
  return sheet;
}

export function buildSalesImportReportWorkbook(
  result: SalesImportResult,
  sourceFileName?: string
): { workbook: XLSX.WorkBook; fileName: string } {
  const warehouses = result.warehouses ?? [result.warehouse];
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const skippedCount = result.rows.filter((row) => row.status === "SKIPPED").length;
  const summaryRows: Array<[string, string | number]> = [
    ["Report", "Sales invoice import result"],
    ["Source file", sourceFileName ?? result.fileName ?? ""],
    ["Overall status", reportStatus(result)],
    ["Import started", readableTime(result.startedAt)],
    ["Import completed", readableTime(result.completedAt)],
    ["Duration", formatDuration(result.durationMs)],
    ["Batches", result.batchCount ?? 1],
    ["Warehouses", warehouses.map((warehouse) => `${warehouse.name} (${warehouse.code})`).join(", ")],
    ["Total invoices", result.totalVouchers],
    ["Total product rows", result.totalLines],
    ["Successful rows", result.successCount],
    ["Failed rows", result.failedCount],
    ["Skipped rows", skippedCount],
    ["New clients", result.createdClientCount ?? 0],
    ["New brands", result.createdBrandCount ?? 0],
    ["New products", result.createdProductCount ?? 0],
    ["Report downloaded", new Date().toLocaleString("en-IN")],
  ];

  const workbook = XLSX.utils.book_new();
  const registerSheet = buildSalesRegisterSheet(result, warehouseById);
  const statusSheet = buildImportStatusSheet(result, warehouseById);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  setColumnWidths(summarySheet, [24, 80]);
  XLSX.utils.book_append_sheet(workbook, registerSheet, "Sales Register");
  XLSX.utils.book_append_sheet(workbook, statusSheet, "Import Status");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const baseName = safeFilePart(
    (sourceFileName ?? result.fileName ?? "sales-import").replace(/\.(xlsx|xls|csv)$/i, "")
  );
  const timestamp = (result.completedAt ?? new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return {
    workbook,
    fileName: `${baseName || "sales-import"}-full-report-${timestamp}.xlsx`,
  };
}

export function downloadSalesImportReport(
  result: SalesImportResult,
  sourceFileName?: string
): void {
  const { workbook, fileName } = buildSalesImportReportWorkbook(result, sourceFileName);
  XLSX.writeFile(workbook, fileName, { cellDates: true });
}
