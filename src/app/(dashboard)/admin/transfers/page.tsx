"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterFields";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import { productDisplayName } from "@/lib/products/productDisplayName";
import { formatBaseQuantityWithStockUnit } from "@/lib/products/productUnits";
import type { PaginationMeta } from "@/types/pagination";
import type { Warehouse } from "@/types/master";
import type { TransferRecord } from "@/types/stock";

type PendingAction = {
  transfer: TransferRecord;
  action: "RECEIVE_PENDING" | "CANCEL_PENDING" | "RETURN_RECEIVED";
};

type SortField =
  | "status"
  | "createdAt"
  | "quantity"
  | "productName"
  | "brandName"
  | "route";

function defaultSortOrder(field: SortField): "asc" | "desc" {
  if (
    field === "status" ||
    field === "productName" ||
    field === "brandName" ||
    field === "route"
  ) {
    return "asc";
  }
  return "desc";
}

export default function AdminTransfersPage() {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [status, setStatus] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [history, wh] = await Promise.all([
        api.transfers.history({
          page,
          limit,
          sortBy,
          sortOrder,
          ...(status ? { status } : {}),
          ...(sourceId ? { sourceWarehouseId: sourceId } : {}),
          ...(destId ? { destinationWarehouseId: destId } : {}),
        }),
        api.warehouses.list(true),
      ]);
      setTransfers(history.items);
      setPagination(history.pagination);
      setWarehouses(wh);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load transfer history");
    } finally {
      setLoading(false);
    }
  }, [status, sourceId, destId, page, limit, sortBy, sortOrder]);

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(defaultSortOrder(field));
    }
    resetPage();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function confirmStatusUpdate() {
    if (!pendingAction) return;
    const { transfer, action } = pendingAction;
    setUpdatingId(transfer.id);
    setError("");
    setSuccess("");
    try {
      if (action === "RETURN_RECEIVED") {
        await api.transfers.returnGoods(transfer.id);
        setSuccess(
          `${formatBaseQuantityWithStockUnit(transfer.quantity, transfer.product)} returned from ${transfer.destinationWarehouse.name} to ${transfer.sourceWarehouse.name}.`
        );
      } else {
        const nextStatus = action === "RECEIVE_PENDING" ? "RECEIVED" : "CANCELLED";
        await api.transfers.updateStatus(transfer.id, { status: nextStatus });
        setSuccess(
          nextStatus === "RECEIVED"
            ? "Transfer marked as received"
            : `${formatBaseQuantityWithStockUnit(transfer.quantity, transfer.product)} restored to ${transfer.sourceWarehouse.name}; transfer cancelled.`
        );
      }
      setPendingAction(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update transfer");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Transfer history"
        description="Track inter-warehouse transfers. Pending items can be received or marked as returned to restock the sending warehouse."
      />

      <div className="flex flex-wrap gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            resetPage();
          }}
          options={[
            { value: "", label: "All statuses" },
            { value: "PENDING", label: "Pending" },
            { value: "RECEIVED", label: "Received" },
            { value: "RETURNED", label: "Returned" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        <FilterSelect
          label="From warehouse"
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            resetPage();
          }}
          options={[
            { value: "", label: "All sources" },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <FilterSelect
          label="To warehouse"
          value={destId}
          onChange={(v) => {
            setDestId(v);
            resetPage();
          }}
          options={[
            { value: "", label: "All destinations" },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
      </div>

      <Alert message={error} />
      {success ? <Alert message={success} type="success" /> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          <DataTable>
            <DataTableHead>
              <SortableTh
                label="Date"
                field="createdAt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableTh
                label="Product"
                field="productName"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableTh
                label="Brand"
                field="brandName"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableTh
                label="Qty"
                field="quantity"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
              <SortableTh
                label="Route"
                field="route"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableTh
                label="Status"
                field="status"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <DataTableTh>By</DataTableTh>
              <DataTableTh align="right">Actions</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    No transfers found
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <DataTableRow key={t.id}>
                    <DataTableTd className="whitespace-nowrap text-zinc-500">
                      {new Date(t.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </DataTableTd>
                    <DataTableTd className="font-medium text-zinc-900">
                      {productDisplayName(t.product)}
                    </DataTableTd>
                    <DataTableTd className="text-zinc-600">{t.brand.name}</DataTableTd>
                    <DataTableTd align="right">
                      <StockQuantityDisplay
                        quantity={t.quantity}
                        stockUnit={t.product.stockUnit}
                        unitsPerStockUnit={t.product.unitsPerStockUnit}
                        baseUnit={t.product.baseUnit}
                        size="sm"
                        align="right"
                      />
                    </DataTableTd>
                    <DataTableTd>
                      <span className="inline-flex items-center gap-1.5 text-sm text-zinc-700">
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-800">
                          {t.sourceWarehouse.code}
                        </span>
                        <span className="text-zinc-400" aria-hidden>
                          →
                        </span>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-800">
                          {t.destinationWarehouse.code}
                        </span>
                      </span>
                    </DataTableTd>
                    <DataTableTd>
                      <StatusBadge status={t.status} />
                    </DataTableTd>
                    <DataTableTd className="text-xs text-zinc-500">
                      <span className="block">{t.createdBy?.name ?? "—"}</span>
                      {t.receivedBy && (
                        <span className="mt-0.5 block text-orange-700">
                          Received by {t.receivedBy.name}
                        </span>
                      )}
                      {t.returnedBy && (
                        <span className="mt-0.5 block text-violet-700">
                          Returned by {t.returnedBy.name}
                        </span>
                      )}
                    </DataTableTd>
                    <DataTableTd align="right" className="!pr-4">
                      {t.status === "PENDING" ? (
                        <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={updatingId !== null}
                            onClick={() =>
                              setPendingAction({
                                transfer: t,
                                action: "RECEIVE_PENDING",
                              })
                            }
                          >
                            Receive
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={updatingId !== null}
                            onClick={() =>
                              setPendingAction({
                                transfer: t,
                                action: "CANCEL_PENDING",
                              })
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : t.status === "RECEIVED" ? (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={updatingId !== null}
                          onClick={() =>
                            setPendingAction({
                              transfer: t,
                              action: "RETURN_RECEIVED",
                            })
                          }
                        >
                          Return
                        </Button>
                      ) : (
                        <span className="text-xs text-zinc-400">No actions</span>
                      )}
                    </DataTableTd>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>
      )}

      {pagination && !loading && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          title={
            pendingAction.action === "RECEIVE_PENDING"
              ? "Mark transfer as received?"
              : pendingAction.action === "RETURN_RECEIVED"
                ? "Return received transfer?"
                : "Cancel pending transfer?"
          }
          description={
            pendingAction.action === "RECEIVE_PENDING"
              ? `${formatBaseQuantityWithStockUnit(pendingAction.transfer.quantity, pendingAction.transfer.product)} of ${productDisplayName(pendingAction.transfer.product)} will be added to ${pendingAction.transfer.destinationWarehouse.name}.`
              : pendingAction.action === "RETURN_RECEIVED"
                ? `${formatBaseQuantityWithStockUnit(pendingAction.transfer.quantity, pendingAction.transfer.product)} will be removed from ${pendingAction.transfer.destinationWarehouse.name} and restored to ${pendingAction.transfer.sourceWarehouse.name}.`
                : `${formatBaseQuantityWithStockUnit(pendingAction.transfer.quantity, pendingAction.transfer.product)} will be restored to ${pendingAction.transfer.sourceWarehouse.name}. The transfer will be cancelled.`
          }
          confirmLabel={
            pendingAction.action === "RECEIVE_PENDING"
              ? "Mark received"
              : pendingAction.action === "RETURN_RECEIVED"
                ? "Confirm returned"
                : "Cancel transfer"
          }
          variant={pendingAction.action === "RECEIVE_PENDING" ? "primary" : "danger"}
          loading={updatingId === pendingAction.transfer.id}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmStatusUpdate}
        />
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
  field: SortField;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider transition hover:text-zinc-800 ${
          active ? "text-orange-700" : "text-zinc-500"
        } ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        {active && (
          <span className="text-[10px] normal-case" aria-hidden>
            {sortOrder === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}
