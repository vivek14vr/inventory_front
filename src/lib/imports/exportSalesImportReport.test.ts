import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import type { SalesImportResult } from "@/types/imports";
import { buildSalesImportReportWorkbook } from "./exportSalesImportReport";

const mixedResult: SalesImportResult = {
  fileName: "invoice-register.xlsx",
  warehouse: { id: "warehouse-1", name: "Goregaon", code: "GOREGAON" },
  totalVouchers: 2,
  totalLines: 2,
  successCount: 1,
  failedCount: 1,
  startedAt: "2026-08-01T08:00:00.000Z",
  completedAt: "2026-08-01T08:00:03.500Z",
  durationMs: 3500,
  batchCount: 1,
  vouchers: [
    {
      voucherIndex: 1,
      headerRowNumber: 4,
      clientName: "Acme",
      invoiceNumber: "INV-1",
      sellDate: "01-Aug-26",
      status: "SUCCESS",
      movementCount: 1,
    },
    {
      voucherIndex: 2,
      headerRowNumber: 6,
      clientName: "Beta",
      invoiceNumber: "INV-2",
      sellDate: "01-Aug-26",
      status: "FAILED",
      message: "Insufficient stock",
    },
  ],
  rows: [
    {
      rowNumber: 5,
      voucherIndex: 1,
      headerRowNumber: 4,
      clientName: "Acme",
      invoiceNumber: "INV-1",
      sellDate: "01-Aug-26",
      productName: "Paper bag",
      brandName: "Brand A",
      quantity: 10,
      warehouseId: "warehouse-1",
      status: "SUCCESS",
      message: "Stock out recorded",
    },
    {
      rowNumber: 7,
      voucherIndex: 2,
      headerRowNumber: 6,
      clientName: "Beta",
      invoiceNumber: "INV-2",
      sellDate: "01-Aug-26",
      productName: "Tray",
      brandName: "Brand B",
      quantity: 20,
      warehouseId: "warehouse-1",
      status: "FAILED",
      message: "Insufficient stock",
    },
  ],
};

describe("sales import full report", () => {
  it("includes summary, invoice, and every row with mixed statuses", () => {
    const { workbook, fileName } = buildSalesImportReportWorkbook(mixedResult);
    assert.deepEqual(workbook.SheetNames, ["Sales Register", "Import Status", "Summary"]);
    assert.match(fileName, /^invoice-register-full-report-/);

    const summary = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Summary, {
      header: 1,
    });
    assert.ok(summary.some((row) => row[0] === "Overall status" && row[1] === "PARTIAL SUCCESS"));

    const register = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Sales Register"], {
      header: 1,
    });
    assert.deepEqual(register[3]?.slice(0, 5), [
      "Date",
      "Particulars",
      "Brand",
      "Voucher Type",
      "Voucher No.",
    ]);
    assert.equal(register.length, 8);

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Import Status"]);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((row) => row.Status), ["SUCCESS", "FAILURE", "SUCCESS", "FAILURE"]);
    assert.equal(rows[3]?.Message, "Insufficient stock");
    assert.ok(rows.every((row) => row["Processed date/time"] instanceof Date));
  });
});
