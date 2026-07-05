import type { AuditFilters, AuditLogEntry, AuditSummary } from "@/types/audit";
import { formatAuditDetails } from "@/lib/audit/formatAuditDetails";
import { escapeHtml, openPrintWindow } from "@/lib/reports/printReport";

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMetadata(log: AuditLogEntry): string {
  return escapeHtml(formatAuditDetails(log));
}

function formatFilterSummary(filters?: AuditFilters): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.userId) parts.push(`User ID: ${filters.userId}`);
  if (filters.action) parts.push(`Action: ${filters.action}`);
  if (filters.entity) parts.push(`Entity: ${filters.entity}`);
  if (filters.dateFrom) parts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`To: ${filters.dateTo}`);
  return parts.length ? parts.join(" · ") : "All records";
}

function groupByDate(logs: AuditLogEntry[]): Array<{ date: string; items: AuditLogEntry[] }> {
  const grouped = new Map<string, AuditLogEntry[]>();
  for (const log of logs) {
    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    const bucket = grouped.get(day) ?? [];
    bucket.push(log);
    grouped.set(day, bucket);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function buildHtml(
  logs: AuditLogEntry[],
  options?: { filters?: AuditFilters; summary?: AuditSummary | null }
): string {
  const byDate = groupByDate(logs);
  const filterLine = formatFilterSummary(options?.filters);
  const summaryLine = options?.summary
    ? `Total events: ${options.summary.total} · Last 7 days: ${options.summary.last7Days}`
    : "";

  const sections = byDate
    .map(
      (day) => `
      <section style="margin-bottom:24px;">
        <h2 style="font-size:14px;margin:0 0 8px;color:#3f3f46;">${formatDay(day.date)}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f4f4f5;">
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">When</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">User</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Action</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Entity</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${day.items
              .map((log) => {
                const user = log.user
                  ? `${escapeHtml(log.user.name)} (${escapeHtml(log.user.email)})`
                  : "System";
                const entity = escapeHtml(log.entity || "—");
                return `
              <tr>
                <td style="padding:8px;border:1px solid #e4e4e7;white-space:nowrap;">${formatDate(log.createdAt)}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${user}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;font-family:monospace;">${escapeHtml(log.action)}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${entity}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;word-break:break-word;">${formatMetadata(log)}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </section>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Audit Log Report</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: system-ui, sans-serif; color: #18181b; padding: 24px; }
  </style>
</head>
<body>
  <header style="margin-bottom:24px;border-bottom:2px solid #059669;padding-bottom:12px;">
    <h1 style="margin:0;font-size:20px;">Audit Log Report</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#71717a;">Generated ${formatDate(new Date().toISOString())}</p>
    ${filterLine ? `<p style="margin:4px 0 0;font-size:12px;color:#71717a;">Filters: ${escapeHtml(filterLine)}</p>` : ""}
    ${summaryLine ? `<p style="margin:4px 0 0;font-size:12px;color:#71717a;">${escapeHtml(summaryLine)}</p>` : ""}
    <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Records in report: ${logs.length}</p>
  </header>
  ${sections || "<p>No audit entries match the selected filters.</p>"}
</body>
</html>`;
}

export function printAuditLogReport(
  logs: AuditLogEntry[],
  options?: { filters?: AuditFilters; summary?: AuditSummary | null }
): void {
  openPrintWindow(buildHtml(logs, options), "Audit Log Report");
}
