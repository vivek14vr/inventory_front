import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildAuditLogWorkbook } from "./auditLogExcel";
import type { AuditLogEntry } from "@/types/audit";

test("audit Excel report exports every event and its advanced audit fields", () => {
  const logs: AuditLogEntry[] = [
    {
      id: "event-1",
      action: "CLIENT_DEACTIVATED",
      entity: "Client",
      entityId: "client-1",
      source: "SYSTEM",
      outcome: "SUCCESS",
      requestId: "request-1",
      user: { id: "user-1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
      metadata: { name: "Example Client", reason: "manual" },
      createdAt: "2026-08-01T08:30:00.000Z",
    },
    {
      id: "event-2",
      action: "SALES_IMPORT",
      entity: "StockMovement",
      source: "APPLICATION",
      outcome: "FAILURE",
      metadata: { imported: 1, failed: 3 },
      createdAt: "2026-08-01T08:35:00.000Z",
    },
  ];

  const { workbook, fileName } = buildAuditLogWorkbook(logs, {
    filters: { source: "SYSTEM" },
    summary: { total: 472, last7Days: 465, topActions: [] },
    generatedAt: new Date("2026-08-01T09:00:00.000Z"),
  });

  assert.deepEqual(workbook.SheetNames, ["Summary", "Audit events"]);
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Audit events"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Action code"], "CLIENT_DEACTIVATED");
  assert.equal(rows[0].Source, "SYSTEM");
  assert.equal(rows[1].Outcome, "FAILURE");
  assert.match(rows[1]["Raw metadata"], /"failed":3/);
  assert.match(fileName, /^audit-log-2026-08-01_09-00-00-000\.xlsx$/);
});
