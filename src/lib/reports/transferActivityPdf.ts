import type { AdminDashboard } from "@/types/inventory";
import type { TransferActivityReport, TransferRecord } from "@/types/stock";
import { productDisplayName } from "@/lib/products/productDisplayName";
import { openPrintWindow } from "@/lib/reports/printReport";

type ActivityRow = AdminDashboard["transferActivity"][number] | TransferRecord;

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

function rowProduct(item: ActivityRow): string {
  if ("product" in item && typeof item.product === "string") {
    return `${item.product} · ${item.brand as string}`;
  }
  const record = item as TransferRecord;
  return `${productDisplayName(record.product)} · ${record.brand.name}`;
}

function rowRoute(item: ActivityRow): string {
  if ("sourceWarehouse" in item && typeof item.sourceWarehouse === "string") {
    return `${item.sourceWarehouse} → ${item.destinationWarehouse as string}`;
  }
  const record = item as TransferRecord;
  return `${record.sourceWarehouse.code} → ${record.destinationWarehouse.code}`;
}

function rowAudit(item: ActivityRow): string {
  const parts: string[] = [];
  if ("initiatedBy" in item && item.initiatedBy) {
    parts.push(`Initiated by ${item.initiatedBy}`);
  } else if ("createdBy" in item && item.createdBy?.name) {
    parts.push(`Initiated by ${item.createdBy.name}`);
  }
  if ("receivedBy" in item && item.receivedBy) {
    const name = typeof item.receivedBy === "string" ? item.receivedBy : item.receivedBy.name;
    if (name) parts.push(`Received by ${name}`);
  }
  if ("returnedBy" in item && item.returnedBy) {
    const name = typeof item.returnedBy === "string" ? item.returnedBy : item.returnedBy.name;
    if (name) parts.push(`Returned by ${name}`);
  }
  return parts.join(" · ") || "—";
}

function buildHtml(
  title: string,
  byDate: Array<{ date: string; items: ActivityRow[] }>
): string {
  const sections = byDate
    .map(
      (day) => `
      <section style="margin-bottom:24px;">
        <h2 style="font-size:14px;margin:0 0 8px;color:#3f3f46;">${formatDay(day.date)}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f4f4f5;">
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Time</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Product</th>
              <th style="text-align:right;padding:8px;border:1px solid #e4e4e7;">Qty</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Route</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Status</th>
              <th style="text-align:left;padding:8px;border:1px solid #e4e4e7;">Audit</th>
            </tr>
          </thead>
          <tbody>
            ${day.items
              .map(
                (item) => `
              <tr>
                <td style="padding:8px;border:1px solid #e4e4e7;white-space:nowrap;">${formatDate(item.createdAt)}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${rowProduct(item)}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;text-align:right;">${item.quantity}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${rowRoute(item)}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${item.status}</td>
                <td style="padding:8px;border:1px solid #e4e4e7;">${rowAudit(item)}</td>
              </tr>`
              )
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
  <title>${title}</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: system-ui, sans-serif; color: #18181b; padding: 24px; }
  </style>
</head>
<body>
  <header style="margin-bottom:24px;border-bottom:2px solid #059669;padding-bottom:12px;">
    <h1 style="margin:0;font-size:20px;">${title}</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#71717a;">Generated ${formatDate(new Date().toISOString())}</p>
  </header>
  ${sections || "<p>No transfer activity in the selected period.</p>"}
</body>
</html>`;
}

export function printDashboardTransferActivity(
  items: AdminDashboard["transferActivity"]
): void {
  const grouped = new Map<string, AdminDashboard["transferActivity"]>();
  for (const item of items) {
    const bucket = grouped.get(item.date) ?? [];
    bucket.push(item);
    grouped.set(item.date, bucket);
  }
  const byDate = [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
  openPrintWindow(buildHtml("Transfer Activity Report", byDate), "Transfer Activity Report");
}

export function printTransferActivityReport(report: TransferActivityReport): void {
  openPrintWindow(buildHtml("Transfer Activity Report", report.byDate), "Transfer Activity Report");
}
