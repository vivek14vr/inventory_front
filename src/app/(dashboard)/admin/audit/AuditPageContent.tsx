"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { printAuditLogReport } from "@/lib/reports/auditLogPdf";
import {
  formatAuditActionLabel,
  formatAuditDetails,
} from "@/lib/audit/formatAuditDetails";
import type { PaginationMeta } from "@/types/pagination";
import type { AuditFilters, AuditLogEntry, AuditSummary } from "@/types/audit";
import type { PublicUser } from "@/types/auth";

const ENTITY_OPTIONS = [
  "",
  "User",
  "Warehouse",
  "Brand",
  "Product",
  "StockMovement",
  "Transfer",
  "Checklist",
  "ChecklistCompletion",
  "TallyImport",
  "Auth",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AuditPageContent() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [userFilterError, setUserFilterError] = useState("");
  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  useEffect(() => {
    api.audit
      .users()
      .then((list) => {
        setUsers(list);
        setUserFilterError("");
      })
      .catch((err) => {
        setUsers([]);
        setUserFilterError(
          err instanceof ApiError ? err.message : "Could not load users for filters"
        );
      });
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [logResult, summaryData] = await Promise.all([
        api.audit.list({ ...filters, page, limit }),
        api.audit.summary(),
      ]);
      setLogs(logResult.items);
      setPagination(logResult.pagination);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  function updateFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    resetPage();
  }

  function clearFilters() {
    setFilters({});
    resetPage();
  }

  const activeFilterCount = [
    filters.userId,
    filters.action,
    filters.entity,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  async function downloadPdf() {
    setDownloading(true);
    setError("");
    try {
      const allLogs: AuditLogEntry[] = [];
      let pageNum = 1;
      let totalPages = 1;

      while (pageNum <= totalPages) {
        const result = await api.audit.list({ ...filters, page: pageNum, limit: 100 });
        allLogs.push(...result.items);
        totalPages = result.pagination.totalPages;
        pageNum += 1;
      }

      printAuditLogReport(allLogs, { filters, summary });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to generate PDF report"
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6 text-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Audit log</h1>
          <p className="mt-1 text-sm text-zinc-600">
            User activity and system changes — filter by user, action, or date
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={downloading}
          disabled={loading}
          onClick={() => void downloadPdf()}
        >
          Download PDF
        </Button>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Total events</p>
            <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Last 7 days</p>
            <p className="mt-1 text-2xl font-semibold">{summary.last7Days}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Top actions</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {summary.topActions.slice(0, 3).map((a) => (
                <li key={a.action}>
                  {formatAuditActionLabel(a.action)}{" "}
                  <span className="text-zinc-400">({a.count})</span>
                </li>
              ))}
              {summary.topActions.length === 0 && (
                <li className="text-zinc-400">No data yet</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-700">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <SelectMenu
            label="User"
            value={filters.userId ?? ""}
            onChange={(v) => updateFilter("userId", v || undefined)}
            options={[
              { value: "", label: "All users" },
              ...users.map((u) => ({
                value: u.id,
                label: u.name,
                sublabel: u.email,
              })),
            ]}
          />
          <SelectMenu
            label="Entity"
            value={filters.entity ?? ""}
            onChange={(v) => updateFilter("entity", v || undefined)}
            options={ENTITY_OPTIONS.map((e) => ({
              value: e,
              label: e || "All entities",
            }))}
          />
          <div>
            <label className="block text-sm font-semibold text-stone-700">Action</label>
            <input
              placeholder="e.g. LOGIN, STOCK_OUT"
              value={filters.action ?? ""}
              onChange={(e) => updateFilter("action", e.target.value || undefined)}
              className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-stone-200 px-3.5 py-2 text-sm text-stone-900 transition placeholder:text-stone-400 hover:border-orange-300 focus:border-orange-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700">From date</label>
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => updateFilter("dateFrom", e.target.value || undefined)}
              className="form-date mt-1.5 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700">To date</label>
            <input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => updateFilter("dateTo", e.target.value || undefined)}
              className="form-date mt-1.5 w-full"
            />
          </div>
        </div>
      </div>

      <Alert message={error} />
      <Alert message={userFilterError} />

      {loading ? (
        <LoadingSpinner label="Loading audit log…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3 hidden md:table-cell">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No audit entries match your filters
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="text-zinc-800">
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <div>
                          <p className="font-medium">{log.user.name}</p>
                          <p className="text-xs text-zinc-500">{log.user.email}</p>
                          <p className="text-xs capitalize text-zinc-400">
                            {log.user.role.replace("_", " ").toLowerCase()}
                          </p>
                        </div>
                      ) : (
                        <span className="text-zinc-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-stone-800">
                        {formatAuditActionLabel(log.action)}
                      </p>
                      <p className="font-mono text-xs text-zinc-400">{log.action}</p>
                    </td>
                    <td className="px-4 py-3">{log.entity}</td>
                    <td className="hidden max-w-md px-4 py-3 text-sm text-stone-700 md:table-cell">
                      {formatAuditDetails(log)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && !loading && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </div>
  );
}
