"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import type { ImportLogKind, ImportLogSummary } from "@/types/imports";

const LABELS: Record<ImportLogKind, string> = {
  products: "Products",
  sales: "Sales",
  clients: "Clients",
};

export function ImportLogHistory({ kind }: { kind: ImportLogKind }) {
  const [logs, setLogs] = useState<ImportLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api.imports.listLogs();
      setLogs(data.filter((log) => log.kind === kind));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load import logs");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function download(id: string) {
    setDownloadingId(id);
    setError("");
    try {
      await api.imports.downloadGeneratedReport(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download import log");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-stone-900">{LABELS[kind]} import logs</h2>
          <p className="text-sm text-stone-500">Download the result workbook from any previous import.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" loading={loading} onClick={() => void load()}>
          Refresh logs
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      {!loading && logs.length === 0 ? (
        <p className="mt-4 rounded-xl bg-stone-50 px-4 py-5 text-sm text-stone-500">No saved import logs yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 text-xs font-bold uppercase text-stone-500">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">File</th><th className="px-3 py-2">Imported by</th><th className="px-3 py-2">Result</th><th className="px-3 py-2 text-right">Log file</th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-stone-100">
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600">{new Date(log.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3 font-medium text-stone-900">{log.fileName}</td>
                  <td className="px-3 py-3 text-stone-600">{log.importedBy.name}</td>
                  <td className="px-3 py-3"><span className="text-emerald-700">{log.successCount} success</span> · <span className="text-red-700">{log.failedCount} failed</span>{log.skippedCount ? ` · ${log.skippedCount} skipped` : ""}</td>
                  <td className="px-3 py-3 text-right">
                    {log.hasReportFile ? (
                      <Button type="button" variant="secondary" size="sm" loading={downloadingId === log.id} onClick={() => void download(log.id)}>Download original .xlsx</Button>
                    ) : (
                      <span className="text-xs text-stone-400">Original file not stored</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
