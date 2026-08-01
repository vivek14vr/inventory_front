import * as XLSX from "xlsx";
import { formatAuditActionLabel, formatAuditDetails } from "@/lib/audit/formatAuditDetails";
import type { AuditFilters, AuditLogEntry, AuditSummary } from "@/types/audit";

function readableTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN");
}

function setColumnWidths(worksheet: XLSX.WorkSheet, widths: number[]): void {
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
}

function filterDescription(filters?: AuditFilters): string {
  if (!filters) return "All records";
  const values = [
    filters.userId ? `User ID: ${filters.userId}` : "",
    filters.action ? `Action: ${filters.action}` : "",
    filters.entity ? `Entity: ${filters.entity}` : "",
    filters.source ? `Source: ${filters.source}` : "",
    filters.outcome ? `Outcome: ${filters.outcome}` : "",
    filters.dateFrom ? `From: ${filters.dateFrom}` : "",
    filters.dateTo ? `To: ${filters.dateTo}` : "",
  ].filter(Boolean);
  return values.length > 0 ? values.join("; ") : "All records";
}

export function buildAuditLogWorkbook(
  logs: AuditLogEntry[],
  options?: { filters?: AuditFilters; summary?: AuditSummary | null; generatedAt?: Date }
): { workbook: XLSX.WorkBook; fileName: string } {
  const generatedAt = options?.generatedAt ?? new Date();
  const summaryRows: Array<[string, string | number]> = [
    ["Report", "Audit log"],
    ["Generated at", generatedAt.toLocaleString("en-IN")],
    ["Applied filters", filterDescription(options?.filters)],
    ["Records exported", logs.length],
    ["Total system events", options?.summary?.total ?? ""],
    ["Events in last 7 days", options?.summary?.last7Days ?? ""],
  ];

  const eventRows = logs.map((log) => ({
    "Event time": readableTime(log.createdAt),
    "User name": log.user?.name ?? "System",
    "User email": log.user?.email ?? "",
    "User role": log.user?.role ?? "",
    "Action label": formatAuditActionLabel(log.action),
    "Action code": log.action,
    Entity: log.entity,
    "Entity ID": log.entityId ?? "",
    Source: log.source ?? "APPLICATION",
    Outcome: log.outcome ?? "SUCCESS",
    "Request ID": log.requestId ?? "",
    Details: formatAuditDetails(log),
    "Raw metadata": log.metadata ? JSON.stringify(log.metadata) : "",
    "Event ID": log.id,
  }));

  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const eventsSheet = XLSX.utils.json_to_sheet(eventRows, {
    header: [
      "Event time",
      "User name",
      "User email",
      "User role",
      "Action label",
      "Action code",
      "Entity",
      "Entity ID",
      "Source",
      "Outcome",
      "Request ID",
      "Details",
      "Raw metadata",
      "Event ID",
    ],
  });
  setColumnWidths(summarySheet, [24, 90]);
  setColumnWidths(eventsSheet, [22, 24, 30, 16, 24, 24, 20, 28, 14, 14, 38, 80, 80, 38]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, eventsSheet, "Audit events");

  const timestamp = generatedAt.toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  return { workbook, fileName: `audit-log-${timestamp}.xlsx` };
}

export function downloadAuditLogExcel(
  logs: AuditLogEntry[],
  options?: { filters?: AuditFilters; summary?: AuditSummary | null }
): void {
  const { workbook, fileName } = buildAuditLogWorkbook(logs, options);
  XLSX.writeFile(workbook, fileName);
}
