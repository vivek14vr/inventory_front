"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { api, ApiError } from "@/lib/api/client";
import type { PaginationMeta } from "@/types/pagination";
import type { StockMovement } from "@/types/stock";

type RowDraft = {
  invoiceNumber: string;
  clientName: string;
  quantity: string;
};

type InvoiceSortField =
  | "invoiceLastWorkedAt"
  | "createdAt"
  | "type"
  | "clientName"
  | "quantity"
  | "invoiceNumber";

function toDraft(m: StockMovement): RowDraft {
  return {
    invoiceNumber: m.invoiceNumber ?? "",
    clientName: m.clientName ?? "",
    quantity: String(m.quantity),
  };
}

function isDirectSellingMovement(m: StockMovement): boolean {
  return m.type === "STOCK_OUT" && m.dispatchType === "DIRECT_SELLING";
}

export function WrongInvoicePanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockMovement[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastWorkedId, setLastWorkedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<InvoiceSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const load = useCallback(
    async (
      term: string,
      pageNum: number,
      pageLimit: number,
      sortField: InvoiceSortField,
      order: "asc" | "desc"
    ) => {
      setLoading(true);
      setError("");
      try {
        const result = await api.inventory.listInvoices({
          ...(term.trim() ? { search: term.trim() } : {}),
          page: pageNum,
          limit: pageLimit,
          sortBy: sortField,
          sortOrder: order,
        });
        setItems(result.items);
        setPagination(result.pagination);
        setDrafts(Object.fromEntries(result.items.map((m) => [m.id, toDraft(m)])));
        const lastWorked = await api.inventory.listInvoices({
          page: 1,
          limit: 1,
          sortBy: "invoiceLastWorkedAt",
          sortOrder: "desc",
        });
        const lastWorkedRow = lastWorked.items[0];
        setLastWorkedId(lastWorkedRow?.invoiceLastWorkedAt ? lastWorkedRow.id : null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load invoices");
        setItems([]);
        setPagination(null);
        setLastWorkedId(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(query, page, limit, sortBy, sortOrder);
  }, [load, query, page, limit, sortBy, sortOrder]);

  // Debounce the search box so it filters live as you type.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === query) return;
    const handle = setTimeout(() => {
      setQuery(trimmed);
      resetPage();
    }, 350);
    return () => clearTimeout(handle);
  }, [search, query, resetPage]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
    resetPage();
  }

  function handleClearSearch() {
    setSearch("");
    setQuery("");
    resetPage();
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
  }

  function handleLimitChange(nextLimit: number) {
    setLimit(nextLimit);
    resetPage();
  }

  function handleSort(field: InvoiceSortField) {
    if (sortBy === field) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" || field === "invoiceLastWorkedAt" ? "desc" : "asc");
    }
    resetPage();
  }

  function updateDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function saveRow(movement: StockMovement) {
    const draft = drafts[movement.id] ?? toDraft(movement);
    const nextInvoice = draft.invoiceNumber.trim();
    const nextClient = draft.clientName.trim();
    const currentInvoice = movement.invoiceNumber?.trim() ?? "";
    const currentClient = movement.clientName?.trim() ?? "";
    const parsedQty = Number.parseInt(draft.quantity, 10);
    const quantityEditable = isDirectSellingMovement(movement);
    const nextQuantity = quantityEditable && Number.isFinite(parsedQty) ? parsedQty : movement.quantity;
    const quantityChanged = quantityEditable && nextQuantity !== movement.quantity;

    if (
      nextInvoice === currentInvoice &&
      nextClient === currentClient &&
      !quantityChanged
    ) {
      setSuccess("No changes to save");
      return;
    }

    if (quantityChanged && (!Number.isFinite(parsedQty) || parsedQty < 1)) {
      setError("Quantity must be a whole number of at least 1");
      return;
    }

    setSavingId(movement.id);
    setError("");
    setSuccess("");
    try {
      const updated = await api.inventory.updateMovementInvoice(movement.id, {
        invoiceNumber: nextInvoice,
        clientName: nextClient,
        ...(quantityChanged ? { quantity: nextQuantity } : {}),
      });
      setSuccess(`Updated ${updated.product?.name ?? "movement"}`);
      // Re-fetch so the current sort order is reapplied to the edited row.
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleLastWorked(movement: StockMovement) {
    const currentlyFlagged = Boolean(movement.invoiceLastWorkedAt);
    setFlaggingId(movement.id);
    setError("");
    setSuccess("");
    try {
      const updated = await api.inventory.updateMovementInvoice(movement.id, {
        markLastWorked: !currentlyFlagged,
      });
      setSuccess(
        updated.invoiceLastWorkedAt
          ? `Marked as last worked: ${updated.product?.name ?? "movement"}`
          : `Cleared last worked flag`
      );
      // Re-fetch so sorting (e.g. by Last worked) reflects the change.
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update last worked");
    } finally {
      setFlaggingId(null);
    }
  }

  async function deleteRow(movement: StockMovement) {
    if (!isDirectSellingMovement(movement)) {
      setError("Only sale invoices can be deleted");
      return;
    }

    const label =
      movement.invoiceNumber?.trim() ||
      movement.clientName?.trim() ||
      movement.product?.name ||
      "this invoice";
    if (
      !window.confirm(
        `Delete invoice for ${label}? Stock (${movement.quantity} units) will be restored to the warehouse.`
      )
    ) {
      return;
    }

    setDeletingId(movement.id);
    setError("");
    setSuccess("");
    try {
      await api.inventory.deleteInvoice(movement.id);
      setSuccess(`Deleted invoice and restored stock for ${movement.product?.name ?? "sale"}`);
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete invoice");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleSearch}
        className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6"
      >
        <h2 className="text-xl font-bold text-stone-900">All invoice records</h2>
        <p className="mt-1 text-base text-stone-500">
          Sales from Stock Out → Sell to client appear here automatically. Returns are listed
          too. Type below to narrow by invoice, client, or product, then edit, save, or delete
          a sale (deleting restores stock).
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input w-full !pl-11"
              placeholder="Search invoice, client, or product…"
            />
          </div>
          {query && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleClearSearch}
              className="sm:min-w-[100px]"
            >
              Clear
            </Button>
          )}
        </div>
      </form>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
          {query ? `No records found for "${query}"` : "No invoice records yet"}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-orange-50 text-xs font-bold uppercase tracking-wide text-orange-800">
                    <SortableTh
                      label="Last worked"
                      field="invoiceLastWorkedAt"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      align="center"
                    />
                    <SortableTh
                      label="Date"
                      field="createdAt"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableTh
                      label="Type"
                      field="type"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3">Product</th>
                    <SortableTh
                      label="Client name"
                      field="clientName"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3">Warehouse</th>
                    <SortableTh
                      label="Qty"
                      field="quantity"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableTh
                      label="Invoice number"
                      field="invoiceNumber"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m, index) => {
                    const isLastWorked = m.id === lastWorkedId;
                    const draft = drafts[m.id] ?? toDraft(m);
                    return (
                      <tr
                        key={m.id}
                        id={isLastWorked ? "last-worked-row" : undefined}
                        className={`border-t border-stone-100 transition-colors ${
                          isLastWorked
                            ? "bg-indigo-50/80 ring-1 ring-inset ring-indigo-200"
                            : index % 2 === 0
                              ? "bg-white"
                              : "bg-stone-50/40"
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            title={
                              isLastWorked ? "Click to remove last worked flag" : "Mark as last worked"
                            }
                            disabled={flaggingId !== null}
                            onClick={() => void toggleLastWorked(m)}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 transition ${
                              isLastWorked
                                ? "border-indigo-400 bg-indigo-100 text-indigo-700"
                                : "border-stone-200 bg-white text-stone-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                            }`}
                          >
                            {flaggingId === m.id ? (
                              <span className="text-xs font-bold">…</span>
                            ) : (
                              <svg
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-5 w-5"
                                aria-hidden
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                          {new Date(m.createdAt).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              m.type === "STOCK_IN"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {m.type === "STOCK_IN" ? "Return" : "Sale"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-900">{m.product?.name}</div>
                          {m.product?.secondaryName?.trim() ? (
                            <div className="text-xs text-stone-500">{m.product.secondaryName}</div>
                          ) : null}
                          <div className="text-xs text-stone-500">{m.brand?.name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={draft.clientName}
                            onChange={(e) =>
                              updateDraft(m.id, { clientName: e.target.value })
                            }
                            className="form-input w-full min-w-[140px]"
                            placeholder="Client name"
                          />
                        </td>
                        <td className="px-4 py-3 text-stone-600">{m.warehouse?.code}</td>
                        <td className="px-4 py-3 text-right">
                          {isDirectSellingMovement(m) ? (
                            <input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={draft.quantity}
                              onChange={(e) =>
                                updateDraft(m.id, { quantity: e.target.value })
                              }
                              className="form-input w-full min-w-[72px] text-right tabular-nums"
                            />
                          ) : (
                            <span className="font-semibold tabular-nums">{m.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={draft.invoiceNumber}
                            onChange={(e) =>
                              updateDraft(m.id, { invoiceNumber: e.target.value })
                            }
                            className="form-input w-full min-w-[140px]"
                            placeholder="Blank"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              loading={savingId === m.id}
                              disabled={
                                (savingId !== null && savingId !== m.id) ||
                                (deletingId !== null && deletingId !== m.id)
                              }
                              onClick={() => void saveRow(m)}
                            >
                              Save
                            </Button>
                            {isDirectSellingMovement(m) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                loading={deletingId === m.id}
                                disabled={
                                  (deletingId !== null && deletingId !== m.id) ||
                                  (savingId !== null && savingId !== m.id)
                                }
                                className="!border-rose-200 !text-rose-800 hover:!bg-rose-50"
                                onClick={() => void deleteRow(m)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && (
            <Pagination
              pagination={pagination}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  align = "left",
}: {
  label: string;
  field: InvoiceSortField;
  sortBy: InvoiceSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: InvoiceSortField) => void;
  align?: "left" | "center" | "right";
}) {
  const active = sortBy === field;
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={`px-4 py-3 ${alignClass}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition hover:text-orange-950 ${
          align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""
        } ${active ? "text-orange-950" : ""}`}
      >
        <span>{label}</span>
        <span className="inline-flex flex-col leading-none text-[9px] text-orange-600/70">
          <span className={active && sortOrder === "asc" ? "text-orange-900" : "opacity-40"}>
            ▲
          </span>
          <span className={active && sortOrder === "desc" ? "text-orange-900" : "opacity-40"}>
            ▼
          </span>
        </span>
      </button>
    </th>
  );
}
