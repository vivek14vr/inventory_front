"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { StatCard } from "@/components/ui/StatCard";
import { FilterSelect } from "@/components/ui/FilterFields";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/ui/DataTable";
import { usePagination } from "@/hooks/usePagination";
import type { PaginationMeta } from "@/types/pagination";
import { formatBaseQuantityWithStockUnit } from "@/lib/products/productUnits";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type { StockItemDetailResponse } from "@/types/inventory";

type MovementFilter = "" | "STOCK_IN" | "STOCK_OUT";

export default function InventoryItemDetailPage() {
  const params = useParams<{ warehouseId: string; productId: string }>();
  const warehouseId = params.warehouseId;
  const productId = params.productId;

  const { page, setPage, limit, setLimit, resetPage } = usePagination(25);
  const [typeFilter, setTypeFilter] = useState<MovementFilter>("");
  const [detail, setDetail] = useState<StockItemDetailResponse | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMessage, setThresholdMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, pagination: meta } = await api.inventory.itemDetail(
        warehouseId,
        productId,
        {
          page,
          limit,
          ...(typeFilter ? { type: typeFilter } : {}),
        }
      );
      setDetail(data);
      setPagination(meta);
      const warehouseOverride = data.item.warehouseLowStockThreshold;
      setThresholdInput(
        warehouseOverride != null ? String(warehouseOverride) : ""
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load item history");
      setDetail(null);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, productId, page, limit, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleTypeFilter(value: MovementFilter) {
    setTypeFilter(value);
    resetPage();
  }

  async function saveThreshold(useDefault: boolean) {
    setSavingThreshold(true);
    setThresholdMessage(null);
    setError(null);

    let value: number | null;
    if (useDefault) {
      value = null;
    } else if (!thresholdInput.trim()) {
      value = null;
    } else {
      const parsed = parseInt(thresholdInput, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Enter a valid whole number (0 or greater).");
        setSavingThreshold(false);
        return;
      }
      value = parsed;
    }

    try {
      await api.inventory.updateLowStockThreshold({
        warehouseId,
        productId,
        lowStockThreshold: value,
      });
      setThresholdMessage(
        value === null
          ? "Using product default threshold."
          : "Warehouse threshold saved."
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update threshold");
    } finally {
      setSavingThreshold(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <Alert type="error" message={error} />
        <Link
          href={AUTH_ROUTES.adminInventory}
          className="text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          ← Back to inventory
        </Link>
      </div>
    );
  }

  if (!detail) return null;

  const { item, summary, items } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={AUTH_ROUTES.adminInventory}
          className="text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          ← Inventory
        </Link>
      </div>

      <PageHeader
        title={item.productName}
        description={[
          item.secondaryProductName?.trim() ? `Secondary: ${item.secondaryProductName}` : null,
          `${item.brandName} · ${item.warehouseName} (${item.warehouseCode})`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {error && <Alert type="error" message={error} />}
      {thresholdMessage && <Alert type="success" message={thresholdMessage} />}

      <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Low stock threshold</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Set a threshold for this warehouse only. Leave blank and save to use the product
          default
          {item.productLowStockThreshold != null
            ? ` (${formatBaseQuantityWithStockUnit(item.productLowStockThreshold, item)})`
            : " (none set on product)"}
          . Effective alert level:{" "}
          {item.lowStockThreshold != null
            ? formatBaseQuantityWithStockUnit(item.lowStockThreshold, item)
            : "not configured"}
          {item.warehouseLowStockThreshold != null ? " (warehouse)" : item.lowStockThreshold != null ? " (default)" : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Warehouse threshold</span>
            <input
              type="number"
              min={0}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              placeholder={
                item.productLowStockThreshold != null
                  ? String(item.productLowStockThreshold)
                  : "e.g. 100"
              }
              className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={savingThreshold}
            onClick={() => void saveThreshold(false)}
          >
            Save
          </Button>
          {item.warehouseLowStockThreshold != null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingThreshold}
              onClick={() => void saveThreshold(true)}
            >
              Use product default
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On hand"
          valueNode={
            <StockQuantityDisplay
              quantity={item.quantity}
              stockUnit={item.stockUnit}
              unitsPerStockUnit={item.unitsPerStockUnit}
              baseUnit={item.baseUnit}
              size="lg"
            />
          }
        />
        <StatCard label="Total stock in" value={summary.totalStockIn.toLocaleString()} variant="info" />
        <StatCard label="Total stock out" value={summary.totalStockOut.toLocaleString()} />
        <StatCard label="Movements" value={summary.movementCount.toLocaleString()} />
      </div>

      {item.updatedAt && (
        <p className="text-sm text-zinc-500">
          Last balance update:{" "}
          {new Date(item.updatedAt).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <FilterSelect
          label="Movement type"
          value={typeFilter}
          onChange={(v) => handleTypeFilter(v as MovementFilter)}
          options={[
            { value: "", label: "All" },
            { value: "STOCK_IN", label: "Stock in" },
            { value: "STOCK_OUT", label: "Stock out" },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Date</DataTableTh>
              <DataTableTh>Type</DataTableTh>
              <DataTableTh>Details</DataTableTh>
              <DataTableTh>Updated by</DataTableTh>
              <DataTableTh align="right">Change</DataTableTh>
              <DataTableTh align="right">Balance after</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    No movements recorded for this item at this warehouse
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableTd className="whitespace-nowrap text-zinc-600">
                      {new Date(row.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </DataTableTd>
                    <DataTableTd>
                      <span
                        className={
                          row.direction === "in"
                            ? "inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-800"
                            : "inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
                        }
                      >
                        {row.direction === "in" ? "In" : "Out"}
                      </span>
                    </DataTableTd>
                    <DataTableTd className="max-w-md text-zinc-800">
                      {row.description}
                      {row.notes && row.notes !== row.description && (
                        <span className="mt-0.5 block text-xs text-zinc-500">{row.notes}</span>
                      )}
                    </DataTableTd>
                    <DataTableTd className="text-zinc-700">
                      {row.createdBy?.name ?? "—"}
                    </DataTableTd>
                    <DataTableTd
                      align="right"
                      className={`tabular-nums font-semibold ${
                        row.change > 0 ? "text-orange-700" : "text-amber-800"
                      }`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {row.change > 0 ? "+" : ""}
                        <StockQuantityDisplay
                          quantity={Math.abs(row.change)}
                          stockUnit={item.stockUnit}
                          unitsPerStockUnit={item.unitsPerStockUnit}
              baseUnit={item.baseUnit}
                          size="sm"
                          align="right"
                          className={
                            row.change > 0
                              ? "[&_span]:!text-orange-700"
                              : "[&_span]:!text-amber-800"
                          }
                        />
                      </span>
                    </DataTableTd>
                    <DataTableTd align="right" className="tabular-nums text-zinc-900">
                      <StockQuantityDisplay
                        quantity={row.balanceAfter}
                        stockUnit={item.stockUnit}
                        unitsPerStockUnit={item.unitsPerStockUnit}
              baseUnit={item.baseUnit}
                        size="sm"
                        align="right"
                      />
                    </DataTableTd>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </div>
  );
}
