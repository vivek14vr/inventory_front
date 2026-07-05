"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { api, ApiError } from "@/lib/api/client";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  printDashboardTransferActivity,
  printTransferActivityReport,
} from "@/lib/reports/transferActivityPdf";
import type { AdminDashboard } from "@/types/inventory";

type TransferActivityPanelProps = {
  items: AdminDashboard["transferActivity"];
};

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TransferActivityPanel({ items }: TransferActivityPanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const grouped = new Map<string, AdminDashboard["transferActivity"]>();
  for (const item of items) {
    const bucket = grouped.get(item.date) ?? [];
    bucket.push(item);
    grouped.set(item.date, bucket);
  }
  const byDate = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));

  async function downloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const report = await api.transfers.activity({ limit: 500 });
      printTransferActivityReport(report);
    } catch (err) {
      if (items.length > 0) {
        printDashboardTransferActivity(items);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Panel
      title="Transfer activity"
      description="Date-wise transfers with audit trail — who moved what, from where to where"
      action={
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={downloading}
            onClick={() => void downloadPdf()}
          >
            Download PDF
          </Button>
          <Link
            href={AUTH_ROUTES.adminTransfers}
            className="text-sm font-medium text-orange-700 hover:text-orange-800"
          >
            Full history
          </Link>
        </div>
      }
    >
      <Alert message={error} />
      {items.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Inter-warehouse transfers will appear here once initiated."
        />
      ) : (
        <div className="space-y-5">
          {byDate.map(([date, dayItems]) => (
            <div key={date}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {formatDay(date)}
              </h3>
              <ul className="space-y-2">
                {dayItems.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {t.product}{" "}
                          <span className="font-normal text-zinc-500">· {t.brand}</span>
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          <span className="font-mono text-xs font-semibold">
                            {t.sourceWarehouse}
                          </span>
                          {" → "}
                          <span className="font-mono text-xs font-semibold">
                            {t.destinationWarehouse}
                          </span>
                          {" · "}
                          Qty <strong>{t.quantity}</strong>
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {t.initiatedBy ? `Initiated by ${t.initiatedBy}` : "Initiated —"}
                      {t.receivedBy ? ` · Received by ${t.receivedBy}` : ""}
                      {t.returnedBy ? ` · Returned by ${t.returnedBy}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
