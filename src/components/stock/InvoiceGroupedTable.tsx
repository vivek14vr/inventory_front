"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api, ApiError } from "@/lib/api/client";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  formatThresholdPreview,
  thresholdBaseToDisplay,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";
import type { InvoiceGroup, InvoiceGroupLine } from "@/types/stock";

type InvoiceGroupedTableProps = {
  groups: InvoiceGroup[];
  canAdjust?: boolean;
  quantityMode: QuantityEntryMode;
  lineDrafts: Record<string, { quantity: string }>;
  savingLinesGroupId: string | null;
  deletingId: string | null;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: InvoiceSortField) => void;
  onLineDraftChange: (movementId: string, quantity: string) => void;
  onSaveGroupQuantities: (group: InvoiceGroup) => void;
  onDeleteLine: (group: InvoiceGroup, line: InvoiceGroupLine) => void;
};

export type InvoiceSortField =
  | "createdAt"
  | "clientName"
  | "quantity"
  | "invoiceNumber"
  | "modificationCount";

type InvoiceUpdateItem = {
  id: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  previousQuantity?: number;
  quantity?: number;
  inventoryDelta?: number;
  previousInvoiceNumber?: string;
  invoiceNumber?: string;
  previousClientName?: string;
  clientName?: string;
  productName?: string;
  warehouseName?: string;
  warehouseCode?: string;
  updatedLineCount?: number;
  summary: string;
};

const CELL = "border-stone-200 px-4 py-3 align-middle";
const LINE_CELL = `${CELL} border-t border-stone-100`;

function formatVoucherDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .replace(/ /g, "-");
}

function formatUpdateWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isEditableSaleLine(line: InvoiceGroupLine): boolean {
  return line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING";
}

function productParticulars(line: InvoiceGroupLine): string {
  if (line.secondaryProductName?.trim()) {
    return `${line.productName} (${line.secondaryProductName.trim()})`;
  }
  return line.productName;
}

function lineUpdateLabel(modificationCount: number): string {
  if (modificationCount <= 0) return "Original";
  if (modificationCount === 1) return "Updated 1×";
  return `Updated ${modificationCount}×`;
}

function LineUpdateStatus({
  line,
  onOpenHistory,
}: {
  line: InvoiceGroupLine;
  onOpenHistory: (line: InvoiceGroupLine) => void;
}) {
  const modificationCount = line.invoiceModificationCount ?? 0;
  const isOriginal = modificationCount <= 0;

  if (isOriginal) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
        {lineUpdateLabel(modificationCount)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenHistory(line)}
      className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
      title="View update history"
    >
      {lineUpdateLabel(modificationCount)}
    </button>
  );
}

function InvoiceUpdateHistoryDialog({
  line,
  onClose,
}: {
  line: InvoiceGroupLine;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<InvoiceUpdateItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.inventory
      .movementInvoiceUpdates(line.movementId)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load update history"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [line.movementId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-update-history-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(80vh,36rem)] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2
            id="invoice-update-history-title"
            className="text-lg font-semibold text-zinc-900"
          >
            Update history
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{productParticulars(line)}</p>
          {line.brandName ? (
            <p className="text-xs text-zinc-500">{line.brandName}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No update details were recorded for this line.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-stone-900">{item.summary}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatUpdateWhen(item.createdAt)}
                    {item.user?.name ? ` · by ${item.user.name}` : ""}
                  </p>
                  {item.inventoryDelta !== undefined && item.inventoryDelta !== 0 ? (
                    <p className="mt-1 text-xs text-stone-600">
                      Stock change:{" "}
                      {item.inventoryDelta > 0 ? "+" : ""}
                      {item.inventoryDelta.toLocaleString("en-IN")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-zinc-100 px-5 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export function InvoiceGroupedTable({
  groups,
  canAdjust = true,
  quantityMode,
  lineDrafts,
  savingLinesGroupId,
  deletingId,
  sortBy,
  sortOrder,
  onSort,
  onLineDraftChange,
  onSaveGroupQuantities,
  onDeleteLine,
}: InvoiceGroupedTableProps) {
  const [historyLine, setHistoryLine] = useState<InvoiceGroupLine | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300 bg-stone-100 text-xs font-bold uppercase tracking-wide text-stone-700">
                <SortableTh
                  label="Date"
                  field="createdAt"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  className="w-[7.5rem] !border-l-0"
                />
                <SortableTh
                  label="Client"
                  field="clientName"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  className="w-[11rem]"
                />
                <SortableTh
                  label="Invoice number"
                  field="invoiceNumber"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  className="w-[9rem]"
                />
                <th className={`${CELL} border-l border-stone-300 min-w-[14rem]`}>Products</th>
                <SortableTh
                  label="Quantity"
                  field="quantity"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  align="right"
                  className="min-w-[11rem] w-[12rem]"
                />
                <SortableTh
                  label="Status"
                  field="modificationCount"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  className="w-[8.5rem]"
                />
                <th
                  className={`${CELL} w-[5.5rem] border-l border-stone-300 text-center`}
                  aria-label="Delete line"
                />
                <th className={`${CELL} w-[11rem] border-l border-stone-300 text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => {
                const hasEditableLines = group.lines.some(isEditableSaleLine);
                const lineCount = Math.max(group.lines.length, 1);
                const groupBg = groupIndex % 2 === 0 ? "bg-white" : "bg-stone-50/40";

                return (
                  <Fragment key={group.id}>
                    {group.lines.map((line, lineIndex) => {
                      const isFirstLine = lineIndex === 0;
                      const isLastLine = lineIndex === group.lines.length - 1;
                      const lineDraft = lineDrafts[line.movementId] ?? {
                        quantity: thresholdBaseToDisplay(line.quantity, quantityMode, line),
                      };
                      const rowBorder = isLastLine ? "border-b-2 border-stone-200" : "";

                      return (
                        <tr
                          key={line.movementId}
                          className={`${groupBg} ${rowBorder}`}
                        >
                          {isFirstLine ? (
                            <td
                              rowSpan={lineCount}
                              className={`${CELL} border-r whitespace-nowrap font-medium text-stone-600`}
                            >
                              {formatVoucherDate(group.createdAt)}
                            </td>
                          ) : null}

                          {isFirstLine ? (
                            <>
                              <td
                                rowSpan={lineCount}
                                className={`${CELL} border-l border-r border-stone-200 font-medium text-stone-800`}
                              >
                                {group.clientName || "—"}
                              </td>
                              <td
                                rowSpan={lineCount}
                                className={`${CELL} border-r border-stone-200 font-medium text-stone-800`}
                              >
                                {group.invoiceNumber || "—"}
                              </td>
                            </>
                          ) : null}

                          <td className={`${isFirstLine ? CELL : LINE_CELL} min-w-[14rem]`}>
                            <p className="font-medium leading-snug text-stone-900">
                              {productParticulars(line)}
                            </p>
                            {line.brandName ? (
                              <p className="mt-0.5 text-xs text-stone-500">{line.brandName}</p>
                            ) : null}
                          </td>

                          <td
                            className={`${isFirstLine ? CELL : LINE_CELL} min-w-[11rem] w-[12rem] text-right tabular-nums`}
                          >
                            {isEditableSaleLine(line) && canAdjust ? (
                              <div className="ml-auto flex w-full max-w-[10.5rem] flex-col items-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  step={
                                    quantityMode === "stockUnit" && usesStockUnit(line)
                                      ? "any"
                                      : 1
                                  }
                                  inputMode="decimal"
                                  value={lineDraft.quantity}
                                  onChange={(e) =>
                                    onLineDraftChange(line.movementId, e.target.value)
                                  }
                                  className="form-input w-full min-w-[7rem] tabular-nums"
                                />
                                {formatThresholdPreview(
                                  lineDraft.quantity,
                                  quantityMode,
                                  line
                                ) ? (
                                  <span className="max-w-full text-right text-[10px] leading-tight text-stone-500">
                                    {formatThresholdPreview(
                                      lineDraft.quantity,
                                      quantityMode,
                                      line
                                    )}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="font-medium text-stone-900">
                                {quantityMode === "stockUnit" && usesStockUnit(line)
                                  ? formatBaseQuantityWithStockUnit(line.quantity, line)
                                  : formatBaseUnits(line.quantity, line)}
                              </span>
                            )}
                          </td>

                          <td
                            className={`${isFirstLine ? CELL : LINE_CELL} border-l border-stone-200`}
                          >
                            <LineUpdateStatus
                              line={line}
                              onOpenHistory={setHistoryLine}
                            />
                          </td>

                          <td
                            className={`${isFirstLine ? CELL : LINE_CELL} border-l border-stone-200 text-center`}
                          >
                            {isEditableSaleLine(line) && canAdjust ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                loading={deletingId === line.movementId}
                                disabled={
                                  deletingId !== null && deletingId !== line.movementId
                                }
                                className="!min-h-8 !px-2 !py-1 !text-xs !border-rose-200 !text-rose-800 hover:!bg-rose-50"
                                onClick={() => onDeleteLine(group, line)}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </td>

                          {isFirstLine ? (
                            <td
                              rowSpan={lineCount}
                              className={`${CELL} border-l border-stone-200 align-top`}
                            >
                              {canAdjust && hasEditableLines ? (
                                <div className="flex h-full min-h-[3rem] flex-col items-end justify-between gap-3 py-0.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    loading={savingLinesGroupId === group.id}
                                    disabled={
                                      savingLinesGroupId !== null &&
                                      savingLinesGroupId !== group.id
                                    }
                                    onClick={() => onSaveGroupQuantities(group)}
                                    className="w-full justify-center"
                                  >
                                    Save quantities
                                  </Button>
                                  {group.warehouse?.code ? (
                                    <span className="w-full text-center text-[10px] font-bold uppercase tracking-wide text-stone-400">
                                      {group.warehouse.code}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="block text-right text-xs text-stone-500">
                                  View only
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {historyLine ? (
        <InvoiceUpdateHistoryDialog
          line={historyLine}
          onClose={() => setHistoryLine(null)}
        />
      ) : null}
    </>
  );
}

function SortableTh({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  field: InvoiceSortField;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: InvoiceSortField) => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const active = sortBy === field;
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={`${CELL} border-l border-stone-300 ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition hover:text-stone-950 ${
          align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""
        } ${active ? "text-stone-950" : ""}`}
      >
        <span>{label}</span>
        <span className="inline-flex flex-col leading-none text-[9px] text-stone-500">
          <span className={active && sortOrder === "asc" ? "text-stone-900" : "opacity-40"}>
            ▲
          </span>
          <span className={active && sortOrder === "desc" ? "text-stone-900" : "opacity-40"}>
            ▼
          </span>
        </span>
      </button>
    </th>
  );
}
