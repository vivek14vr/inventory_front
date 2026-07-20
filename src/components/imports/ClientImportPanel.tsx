"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  ImportExampleCard,
  ImportPreviewStats,
  ImportTip,
  ImportUploadForm,
} from "@/components/imports/ImportUploadForm";
import { formatSecondaryName } from "@/lib/products/productNames";
import type {
  ClientImportPreview,
  ClientImportPreviewRow,
  ClientImportResult,
  ClientImportRowDecision,
} from "@/types/imports";

type RowActionState = {
  action: "merge" | "create";
  mergeTargetClientId?: string;
};

const DEMO_ROWS = [
  { primary: "Sharma Traders", secondary: "Sharma & Co" },
  { primary: "Metro Foods", secondary: "" },
];

function defaultMergeClientId(row: ClientImportPreviewRow): string | undefined {
  return row.matchedClient?.id ?? row.reactivatesClient?.id;
}

function initRowActions(preview: ClientImportPreview): Record<number, RowActionState> {
  const states: Record<number, RowActionState> = {};
  for (const row of preview.rows) {
    if (row.errors.length > 0) continue;
    states[row.rowNumber] = {
      action: row.category === "matched" ? "merge" : "create",
      mergeTargetClientId: defaultMergeClientId(row),
    };
  }
  return states;
}

export function ClientImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClientImportPreview | null>(null);
  const [rowActions, setRowActions] = useState<Record<number, RowActionState>>({});
  const [result, setResult] = useState<ClientImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const matchedRows = useMemo(
    () => preview?.rows.filter((row) => row.category === "matched") ?? [],
    [preview]
  );
  const newRows = useMemo(
    () => preview?.rows.filter((row) => row.category === "new") ?? [],
    [preview]
  );

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setResult(null);
    try {
      const data = await api.imports.previewClients(file);
      setPreview(data);
      setRowActions(initRowActions(data));
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Failed to read Excel file");
    } finally {
      setLoading(false);
    }
  }

  function updateRowAction(rowNumber: number, patch: Partial<RowActionState>) {
    setRowActions((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], ...patch },
    }));
  }

  async function handleConfirm() {
    if (!preview) return;

    const validationErrors: string[] = [];
    for (const row of preview.rows.filter((item) => item.errors.length === 0)) {
      const state = rowActions[row.rowNumber];
      const action = state?.action ?? (row.category === "matched" ? "merge" : "create");
      const mergeTargetClientId =
        action === "merge"
          ? state?.mergeTargetClientId ?? defaultMergeClientId(row)
          : undefined;

      if (action === "merge" && !mergeTargetClientId) {
        validationErrors.push(`Row ${row.rowNumber}: select a client to merge into`);
      }
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" · "));
      return;
    }

    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      const rows: ClientImportRowDecision[] = preview.rows
        .filter((row) => row.errors.length === 0)
        .map((row) => {
          const state = rowActions[row.rowNumber];
          const action = state?.action ?? (row.category === "matched" ? "merge" : "create");
          return {
            rowNumber: row.rowNumber,
            primaryName: row.primaryName,
            secondaryName: row.secondaryName,
            action,
            mergeTargetClientId:
              action === "merge"
                ? state?.mergeTargetClientId ?? defaultMergeClientId(row)
                : undefined,
          };
        });

      const importResult = await api.imports.confirmClients({
        fileName: file?.name,
        rows,
      });
      setResult(importResult);
      setSuccess(
        `Import complete: ${importResult.successCount} succeeded, ${importResult.failedCount} failed`
      );
      setPreview(null);
      setRowActions({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setRowActions({});
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <ImportUploadForm
        title="Import clients"
        description="Add or update clients from Excel. Primary name is required; secondary is optional. Matched rows can merge into an existing client or create a new one."
        file={file}
        fileInputRef={fileInputRef}
        loading={loading}
        showReset={Boolean(preview || result)}
        onFileChange={(next) => {
          setFile(next);
          setPreview(null);
          setResult(null);
        }}
        onSubmit={handlePreview}
        onReset={reset}
        tip={
          <ImportTip>
            Client names are company-wide — the same list is used at every warehouse
            for stock out and returns.
          </ImportTip>
        }
        example={
          <ImportExampleCard title="Example columns">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-white text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-2.5">Primary name</th>
                  <th className="px-3 py-2.5">Secondary name</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map((row) => (
                  <tr
                    key={row.primary}
                    className="border-t border-stone-100 bg-white/70 text-stone-800"
                  >
                    <td className="px-3 py-2.5 font-medium">{row.primary}</td>
                    <td className="px-3 py-2.5 text-stone-500">
                      {row.secondary || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ImportExampleCard>
        }
      />

      <Alert message={error} />
      <Alert message={success} type="success" />

      {preview && (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
              Step 2 · Review & confirm
            </p>
            <h3 className="mt-1 text-lg font-bold text-stone-900">
              Preview results
            </h3>
          </div>

          <ImportPreviewStats
            items={[
              { label: "Total rows", value: preview.totalRows },
              {
                label: "Matched",
                value: preview.matchedCount,
                tone: "info",
              },
              { label: "New", value: preview.newCount, tone: "success" },
              ...(preview.errorCount > 0
                ? [
                    {
                      label: "Errors",
                      value: preview.errorCount,
                      tone: "danger" as const,
                    },
                  ]
                : []),
            ]}
          />

          {matchedRows.length > 0 && (
            <ImportReviewTable
              title="Matched clients"
              description="These rows match an existing client by primary name. Default: merge into the existing client."
              rows={matchedRows}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="matched"
            />
          )}

          {newRows.length > 0 && (
            <ImportReviewTable
              title="New clients"
              description="No matching client found. Default: create as new. You can merge into an existing client instead."
              rows={newRows}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="new"
            />
          )}

          {preview.rows.some((row) => row.errors.length > 0) && (
            <ImportReviewTable
              title="Rows with errors"
              description="Fix these in your Excel file and re-upload."
              rows={preview.rows.filter((row) => row.errors.length > 0)}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="errors"
            />
          )}

          <Button
            type="button"
            size="lg"
            disabled={
              confirming ||
              preview.rows.every((row) => row.errors.length > 0) ||
              preview.errorCount === preview.totalRows
            }
            loading={confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? "Importing…" : "Confirm import"}
          </Button>
        </div>
      )}

      {result && <ClientImportResultSummary result={result} />}
    </div>
  );
}

function ImportReviewTable({
  title,
  description,
  rows,
  preview,
  rowActions,
  onUpdateAction,
  mode,
}: {
  title: string;
  description: string;
  rows: ClientImportPreviewRow[];
  preview: ClientImportPreview;
  rowActions: Record<number, RowActionState>;
  onUpdateAction: (rowNumber: number, patch: Partial<RowActionState>) => void;
  mode: "matched" | "new" | "errors";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        <p className="mt-0.5 text-sm text-zinc-600">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Primary name</th>
              <th className="px-3 py-2">Secondary name</th>
              {mode === "matched" && <th className="px-3 py-2">Client match</th>}
              {mode !== "errors" && <th className="px-3 py-2">Action</th>}
              {mode === "errors" && <th className="px-3 py-2">Errors</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = rowActions[row.rowNumber];
              const action = state?.action ?? (mode === "matched" ? "merge" : "create");

              return (
                <tr key={row.rowNumber} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500">{row.rowNumber}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900">{row.primaryName}</td>
                  <td className="px-3 py-2 text-zinc-600">
                    {formatSecondaryName(row.secondaryName)}
                  </td>
                  {mode === "matched" && (
                    <td className="px-3 py-2 text-zinc-600">
                      {row.matchedClient ? (
                        <>
                          <div className="font-medium">{row.matchedClient.name}</div>
                          {row.matchedClient.secondaryName ? (
                            <div className="text-xs">{row.matchedClient.secondaryName}</div>
                          ) : null}
                        </>
                      ) : row.reactivatesClient ? (
                        <div className="text-xs text-amber-700">
                          Will reactivate {row.reactivatesClient.name}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {mode !== "errors" && (
                    <td className="px-3 py-2">
                      <div className="flex min-w-[180px] flex-col gap-2">
                        <select
                          value={action}
                          onChange={(e) => {
                            const next = e.target.value as "merge" | "create";
                            onUpdateAction(row.rowNumber, {
                              action: next,
                              mergeTargetClientId:
                                next === "merge"
                                  ? state?.mergeTargetClientId ??
                                    defaultMergeClientId(row) ??
                                    preview.existingClients[0]?.id
                                  : undefined,
                            });
                          }}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          {mode === "matched" ? (
                            <>
                              <option value="merge">Use existing client</option>
                              <option value="create">Create new client</option>
                            </>
                          ) : (
                            <>
                              <option value="create">Create new client</option>
                              <option value="merge">Merge with existing client</option>
                            </>
                          )}
                        </select>
                        {action === "merge" ? (
                          <select
                            value={
                              state?.mergeTargetClientId ??
                              defaultMergeClientId(row) ??
                              preview.existingClients[0]?.id ??
                              ""
                            }
                            onChange={(e) =>
                              onUpdateAction(row.rowNumber, {
                                mergeTargetClientId: e.target.value,
                              })
                            }
                            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs"
                          >
                            {preview.existingClients.length === 0 ? (
                              <option value="">No clients in system</option>
                            ) : (
                              preview.existingClients.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.name}
                                  {client.secondaryName ? ` (${client.secondaryName})` : ""}
                                </option>
                              ))
                            )}
                          </select>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {mode === "errors" && (
                    <td className="px-3 py-2 text-red-700">
                      {row.errors.join(" · ")}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientImportResultSummary({ result }: { result: ClientImportResult }) {
  const failedRows = result.rows.filter((row) => row.status === "FAILED");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-zinc-900">Import result</h3>
      {result.fileName ? (
        <p className="mt-1 text-sm text-zinc-600">File: {result.fileName}</p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-700">
        {result.successCount} succeeded · {result.failedCount} failed · {result.totalRows} total
      </p>
      {failedRows.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-red-800">
          {failedRows.map((row) => (
            <li key={row.rowNumber}>
              Row {row.rowNumber} ({row.primaryName}): {row.message ?? "Failed"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
