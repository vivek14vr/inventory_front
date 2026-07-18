"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StockFlowBackButton } from "@/components/stock/StockFlowBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import { usePagination } from "@/hooks/usePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { productDisplayName } from "@/lib/products/productDisplayName";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  formatQuantityEntryPreview,
  getBaseUnitLabel,
  getStockUnitLabel,
  pluralizeStockUnit,
  quantityEntryLabel,
  thresholdBaseToDisplay,
  thresholdDisplayToBase,
  usesStockUnit,
  type QuantityEntryMode,
  type ProductUnitFields,
} from "@/lib/products/productUnits";
import { validatePositiveInteger } from "@/lib/validation/quantity";
import { api, ApiError } from "@/lib/api/client";
import type {
  ClientReturnInvoice,
  ClientReturnInvoiceLine,
  ClientReturnInvoiceSummary,
} from "@/types/stock";
import type { PaginationMeta } from "@/types/pagination";

type ClientReturnPanelProps = {
  defaultWarehouseId?: string;
  onBack?: () => void;
};

function lineUnitFields(line: ClientReturnInvoiceLine) {
  return {
    stockUnit: line.stockUnit,
    unitsPerStockUnit: line.unitsPerStockUnit,
    baseUnit: line.baseUnit,
  };
}

function formatQuantityForMode(
  baseQty: number,
  mode: QuantityEntryMode,
  units: Partial<ProductUnitFields>
): string {
  if (mode === "stockUnit" && usesStockUnit(units)) {
    return formatBaseQuantityWithStockUnit(baseQty, units);
  }
  return formatBaseUnits(baseQty, units);
}

function quantityModeUnitName(
  mode: QuantityEntryMode,
  units: Partial<ProductUnitFields>,
  count = 2
): string {
  if (mode === "units" && usesStockUnit(units)) {
    return pluralizeStockUnit(getBaseUnitLabel(units), count);
  }
  return pluralizeStockUnit(getStockUnitLabel(units), count);
}

function formatSaleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClientReturnPanel({
  defaultWarehouseId = "",
  onBack,
}: ClientReturnPanelProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [invoices, setInvoices] = useState<ClientReturnInvoiceSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<Record<string, ClientReturnInvoice>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [returnQtyDrafts, setReturnQtyDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [notesByInvoice, setNotesByInvoice] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const listRequestIdRef = useRef(0);

  const quantityToggleProduct = useMemo(() => {
    for (const invoice of Object.values(invoiceDetails)) {
      const line = invoice.lines.find((l) => usesStockUnit(lineUnitFields(l)));
      if (line) return lineUnitFields(line);
    }
    return { stockUnit: "carton", unitsPerStockUnit: 1, baseUnit: "piece" };
  }, [invoiceDetails]);

  function handleQuantityModeChange(nextMode: QuantityEntryMode) {
    setReturnQtyDrafts((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [invoiceId, drafts] of Object.entries(prev)) {
        const invoice = invoiceDetails[invoiceId];
        next[invoiceId] = {};
        for (const [movementId, display] of Object.entries(drafts)) {
          const line = invoice?.lines.find((l) => l.saleMovementId === movementId);
          if (!line || !display.trim()) {
            next[invoiceId][movementId] = display;
            continue;
          }
          const base = thresholdDisplayToBase(
            display,
            quantityMode,
            lineUnitFields(line)
          );
          next[invoiceId][movementId] =
            base == null
              ? display
              : thresholdBaseToDisplay(base, nextMode, lineUnitFields(line));
        }
      }
      return next;
    });
    setQuantityMode(nextMode);
  }

  const loadInvoiceList = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    setListLoading(true);
    setError("");
    try {
      const result = await api.stock.listClientReturnInvoices({
        page,
        limit,
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(defaultWarehouseId ? { warehouseId: defaultWarehouseId } : {}),
      });
      if (requestId !== listRequestIdRef.current) return;
      setInvoices(result.items);
      setPagination(result.pagination);
    } catch (err) {
      if (requestId !== listRequestIdRef.current) return;
      setInvoices([]);
      setPagination(null);
      setError(err instanceof ApiError ? err.message : "Failed to load invoices");
    } finally {
      if (requestId === listRequestIdRef.current) {
        setListLoading(false);
      }
    }
  }, [page, limit, debouncedSearch, defaultWarehouseId]);

  const loadInvoiceDetail = useCallback(async (summary: ClientReturnInvoiceSummary) => {
    setDetailLoadingId(summary.id);
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[summary.id];
      return next;
    });
    setError("");
    try {
      const result = await api.stock.getClientReturnInvoice({
        invoiceNumber: summary.invoiceNumber,
        clientName: summary.clientName,
        warehouseId: summary.warehouse.id,
      });
      setInvoiceDetails((prev) => ({ ...prev, [summary.id]: result }));
      setReturnQtyDrafts((prev) => ({
        ...prev,
        [summary.id]: Object.fromEntries(
          result.lines.map((line) => [line.saleMovementId, ""])
        ),
      }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [summary.id]:
          err instanceof ApiError ? err.message : "Failed to load invoice details",
      }));
    } finally {
      setDetailLoadingId(null);
    }
  }, []);

  useEffect(() => {
    void loadInvoiceList();
  }, [loadInvoiceList]);

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, resetPage]);

  async function toggleInvoice(summary: ClientReturnInvoiceSummary) {
    if (expandedId === summary.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(summary.id);
    setSuccess("");

    if (!invoiceDetails[summary.id]) {
      await loadInvoiceDetail(summary);
    }
  }

  async function refreshAfterChange(invoiceId: string) {
    const summary = invoices.find((item) => item.id === invoiceId);
    if (!summary) {
      await loadInvoiceList();
      return;
    }

    try {
      const [listResult, detail] = await Promise.all([
        api.stock.listClientReturnInvoices({
          page,
          limit,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
          ...(defaultWarehouseId ? { warehouseId: defaultWarehouseId } : {}),
        }),
        api.stock.getClientReturnInvoice({
          invoiceNumber: summary.invoiceNumber,
          clientName: summary.clientName,
          warehouseId: summary.warehouse.id,
        }),
      ]);
      setInvoices(listResult.items);
      setPagination(listResult.pagination);
      setInvoiceDetails((prev) => ({ ...prev, [invoiceId]: detail }));
      setReturnQtyDrafts((prev) => ({
        ...prev,
        [invoiceId]: Object.fromEntries(
          detail.lines.map((line) => [line.saleMovementId, ""])
        ),
      }));
    } catch {
      await loadInvoiceList();
      if (summary) await loadInvoiceDetail(summary);
    }
  }

  async function handleReturnItems(
    invoice: ClientReturnInvoice,
    invoiceId: string,
    line: ClientReturnInvoiceLine
  ) {
    const raw = returnQtyDrafts[invoiceId]?.[line.saleMovementId] ?? "";
    const units = lineUnitFields(line);
    const qty = thresholdDisplayToBase(raw, quantityMode, units);
    const qtyError =
      qty == null ? "Enter how many items are being returned" : validatePositiveInteger(qty, "Return quantity");
    if (qty == null || qtyError) {
      setError(qtyError ?? "Enter how many items are being returned");
      return;
    }
    if (qty > line.returnableQuantity) {
      const maxDisplay = thresholdBaseToDisplay(
        line.returnableQuantity,
        quantityMode,
        units
      );
      const unitLabel = quantityModeUnitName(quantityMode, units);
      setError(
        `Cannot return more than ${maxDisplay} ${unitLabel} remaining on this line`
      );
      return;
    }

    setSubmitting(line.saleMovementId);
    setError("");
    setSuccess("");
    try {
      const result = await api.stock.submitClientReturn({
        mode: "line",
        saleMovementId: line.saleMovementId,
        quantity: qty,
        notes: notesByInvoice[invoiceId]?.trim() || undefined,
      });

      if (result.mode !== "line") {
        setError("Server did not confirm the return");
        return;
      }

      const productName = productDisplayName(line);

      setSuccess(
        `Returned ${formatBaseQuantityWithStockUnit(result.quantity, units)} of ${productName} to ${invoice.warehouse.name} (invoice ${invoice.invoiceNumber}). Stock is now ${formatBaseQuantityWithStockUnit(result.balance, units)}.`
      );
      await refreshAfterChange(invoiceId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process return");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-5">
      {onBack ? <StockFlowBackButton onClick={onBack} /> : null}

      <div className="space-y-4 rounded-2xl border-2 border-stone-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Client return by invoice</h2>
          <p className="mt-1 text-sm text-stone-600">
            Search below with client, sell date, and warehouse. Open an invoice and enter
            how many cartons or pieces of each product are being returned.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-stone-700">
            Filter invoices (optional)
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input mt-1"
            placeholder="Invoice number, client, or product…"
          />
        </div>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {listLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
          No sale invoices found.
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((item) => {
            const isOpen = expandedId === item.id;
            const invoice = invoiceDetails[item.id];
            const isLoadingDetail = detailLoadingId === item.id;

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-2xl border-2 bg-white transition ${
                  isOpen ? "border-orange-300 shadow-sm" : "border-stone-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-base font-bold text-stone-900">
                      Invoice {item.invoiceNumber}
                    </p>
                    <p className="text-sm font-medium text-stone-700">
                      Client: {item.clientName}
                    </p>
                    <p className="text-sm text-stone-600">
                      Sell date: {formatSaleDate(item.saleDate)}
                    </p>
                    <p className="text-sm text-stone-600">
                      Warehouse: {item.warehouse.name}{" "}
                      <span className="font-mono text-xs text-stone-500">
                        ({item.warehouse.code})
                      </span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {item.lineCount} product{item.lineCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={isOpen ? "primary" : "outline"}
                    onClick={() => void toggleInvoice(item)}
                    className="shrink-0"
                  >
                    {isOpen ? "Close" : "Open"}
                  </Button>
                </div>

                {isOpen ? (
                  <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-4 sm:px-5 sm:py-5">
                    {isLoadingDetail ? (
                      <div className="flex justify-center py-8">
                        <LoadingSpinner />
                      </div>
                    ) : detailErrors[item.id] ? (
                      <Alert message={detailErrors[item.id]} />
                    ) : invoice ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-stone-700">
                            Notes (optional)
                          </label>
                          <input
                            value={notesByInvoice[item.id] ?? ""}
                            onChange={(e) =>
                              setNotesByInvoice((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="form-input mt-2"
                            placeholder="Reason for return, etc."
                          />
                        </div>

                        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                          <table className="w-full min-w-[520px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-stone-200 bg-stone-50 text-xs font-bold uppercase text-stone-600">
                                <th className="px-4 py-3">Product</th>
                                <th className="px-4 py-3">Current sold</th>
                                <th className="px-4 py-3">
                                  <div className="flex flex-col items-start gap-2 normal-case">
                                    <span className="text-xs font-bold uppercase tracking-wide text-stone-600">
                                      Returned items
                                    </span>
                                    <ThresholdUnitToggle
                                      mode={quantityMode}
                                      onModeChange={handleQuantityModeChange}
                                      product={quantityToggleProduct}
                                      size="sm"
                                      alwaysShow
                                      fallbackStockUnitLabel="Cartons"
                                      fallbackBaseUnitLabel="Pieces"
                                    />
                                  </div>
                                </th>
                                <th className="px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody>
                              {invoice.lines.map((line) => {
                                const returnQty =
                                  returnQtyDrafts[item.id]?.[line.saleMovementId] ?? "";
                                const canReturn = line.returnableQuantity > 0;
                                const units = lineUnitFields(line);
                                const maxDisplay = thresholdBaseToDisplay(
                                  line.returnableQuantity,
                                  quantityMode,
                                  units
                                );
                                const unitName = quantityModeUnitName(quantityMode, units);
                                const entryHint = quantityEntryLabel(quantityMode, units);
                                const preview = formatQuantityEntryPreview(
                                  Number(returnQty),
                                  quantityMode,
                                  units
                                );
                                const allowDecimal =
                                  quantityMode === "stockUnit" && usesStockUnit(units);
                                return (
                                  <tr
                                    key={line.saleMovementId}
                                    className="border-b border-stone-100 last:border-b-0"
                                  >
                                    <td className="px-4 py-3">
                                      <p className="font-semibold text-stone-900">
                                        {productDisplayName(line)}
                                      </p>
                                      <p className="text-xs text-stone-500">{line.brandName}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-sm font-semibold tabular-nums text-stone-900">
                                        {formatQuantityForMode(
                                          line.soldQuantity,
                                          quantityMode,
                                          units
                                        )}
                                      </span>
                                      {line.returnedQuantity > 0 ? (
                                        <p className="mt-1 text-xs text-stone-500">
                                          Already returned:{" "}
                                          {formatQuantityForMode(
                                            line.returnedQuantity,
                                            quantityMode,
                                            units
                                          )}
                                        </p>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="number"
                                          min={allowDecimal ? 0 : 1}
                                          step={allowDecimal ? "any" : 1}
                                          max={maxDisplay || undefined}
                                          value={returnQty}
                                          disabled={!canReturn || submitting !== null}
                                          onChange={(e) =>
                                            setReturnQtyDrafts((prev) => ({
                                              ...prev,
                                              [item.id]: {
                                                ...prev[item.id],
                                                [line.saleMovementId]: e.target.value,
                                              },
                                            }))
                                          }
                                          className="form-input w-28"
                                          placeholder="0"
                                          aria-label={entryHint}
                                        />
                                        <span className="text-xs font-medium text-stone-500">
                                          {unitName}
                                        </span>
                                      </div>
                                      {canReturn ? (
                                        <p className="mt-1 text-xs text-stone-500">
                                          Max {maxDisplay} {unitName}
                                          {preview ? ` · ${preview}` : ""}
                                        </p>
                                      ) : (
                                        <p className="mt-1 text-xs text-stone-500">
                                          Nothing left to return
                                        </p>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Button
                                        type="button"
                                        size="sm"
                                        loading={submitting === line.saleMovementId}
                                        disabled={!canReturn || submitting !== null}
                                        onClick={() =>
                                          void handleReturnItems(invoice, item.id, line)
                                        }
                                      >
                                        Update
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {pagination ? (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
              <Pagination
                pagination={pagination}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
