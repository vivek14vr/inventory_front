"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/ui/DataTable";
import { StatCard } from "@/components/ui/StatCard";
import { usePagination } from "@/hooks/usePagination";
import type { PaginationMeta } from "@/types/pagination";
import type { Brand, Warehouse } from "@/types/master";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FilterField, FilterSelect } from "@/components/ui/FilterFields";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { formatSecondaryName } from "@/lib/products/productNames";
import { isWarehouseLowStock, lowStockSourceLabel } from "@/lib/inventory/lowStock";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  formatThresholdPreview,
  getBaseUnitLabel,
  pluralizeStockUnit,
  splitBaseQuantity,
  stockUnitsAndLooseToBase,
  thresholdBaseToDisplay,
  thresholdDisplayToBase,
  usesStockUnit,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type {
  LowStockResponse,
  StockLocationLastChange,
  StockProductRow,
  StockResponse,
  StockRow,
} from "@/types/inventory";
import type { StockMovement } from "@/types/stock";

type Tab = "stock" | "movements" | "low-stock";

type StockSortField = "quantity" | "productName" | "brandName" | "warehouseName" | "updatedAt";
type MovementSortField = "createdAt" | "quantity" | "type";
type LowStockSortField =
  | "quantity"
  | "productName"
  | "brandName"
  | "warehouseName"
  | "lowStockThreshold";

const STOCK_SORT_OPTIONS: { value: StockSortField; label: string }[] = [
  { value: "updatedAt", label: "Last updated" },
  { value: "productName", label: "Product" },
  { value: "brandName", label: "Brand" },
  { value: "warehouseName", label: "Warehouse" },
  { value: "quantity", label: "Quantity" },
];

const MOVEMENT_SORT_OPTIONS: { value: MovementSortField; label: string }[] = [
  { value: "createdAt", label: "Date" },
  { value: "type", label: "Type" },
  { value: "quantity", label: "Quantity" },
];

const LOW_STOCK_SORT_OPTIONS: { value: LowStockSortField; label: string }[] = [
  { value: "quantity", label: "Quantity" },
  { value: "productName", label: "Product" },
  { value: "brandName", label: "Brand" },
  { value: "warehouseName", label: "Warehouse" },
  { value: "lowStockThreshold", label: "Threshold" },
];

export default function AdminInventoryPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState<StockResponse | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [lowStock, setLowStock] = useState<LowStockResponse | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [success, setSuccess] = useState("");
  const [sortBy, setSortBy] = useState<string>("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  useEffect(() => {
    setFilterError("");
    Promise.all([api.warehouses.list(true), api.brands.list()])
      .then(([w, b]) => {
        setWarehouses(w);
        setBrands(b);
      })
      .catch((err) => {
        setFilterError(
          err instanceof ApiError
            ? err.message
            : "Could not load warehouses or brands for filters"
        );
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = {
        page,
        limit,
        sortBy,
        sortOrder,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        ...(brandId ? { brandId } : {}),
      };

      if (tab === "stock") {
        const result = await api.inventory.stock(base);
        setStock(result.data);
        setPagination(result.pagination);
      } else if (tab === "movements") {
        const result = await api.inventory.movements({
          ...base,
          ...(movementType ? { type: movementType } : {}),
        });
        setMovements(result.items);
        setPagination(result.pagination);
        setStock(null);
        setLowStock(null);
      } else {
        const result = await api.inventory.lowStock(base);
        setLowStock(result.data);
        setPagination(result.pagination);
        setStock(null);
        setMovements([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tab, warehouseId, brandId, movementType, search, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    resetPage();
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    resetPage();
    if (next === "stock") {
      setSortBy("updatedAt");
      setSortOrder("desc");
    } else if (next === "movements") {
      setSortBy("createdAt");
      setSortOrder("desc");
    } else {
      setSortBy("quantity");
      setSortOrder("asc");
    }
  }

  const sortOptions =
    tab === "stock"
      ? STOCK_SORT_OPTIONS
      : tab === "movements"
        ? MOVEMENT_SORT_OPTIONS
        : LOW_STOCK_SORT_OPTIONS;

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Inventory & stock"
        description="View stock levels and set a different low-stock alert for each warehouse."
        actions={
          <ButtonLink href={AUTH_ROUTES.adminStockIn} size="sm">
            Stock in
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ["stock", "Current stock"],
            ["movements", "Movements"],
            ["low-stock", "Low stock"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabChange(key)}
            className={`min-h-14 rounded-2xl border-2 px-5 py-3.5 text-base font-bold transition active:scale-[0.98] ${
              tab === key
                ? "border-orange-600 bg-orange-600 text-white shadow-md shadow-orange-900/20"
                : "border-stone-200 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <FilterField label="Search">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Product, brand, warehouse…"
            className="w-full min-w-[200px] rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </FilterField>
        <FilterSelect
          label="Warehouse"
          value={warehouseId}
          onChange={(v) => handleFilterChange(setWarehouseId, v)}
          options={[
            { value: "", label: "All" },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <FilterSelect
          label="Brand"
          value={brandId}
          onChange={(v) => handleFilterChange(setBrandId, v)}
          options={[
            { value: "", label: "All" },
            ...brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        {tab === "movements" && (
          <FilterSelect
            label="Type"
            value={movementType}
            onChange={(v) => handleFilterChange(setMovementType, v)}
            options={[
              { value: "", label: "All" },
              { value: "STOCK_IN", label: "Stock In" },
              { value: "STOCK_OUT", label: "Stock Out" },
            ]}
          />
        )}
        <SelectMenu
          label="Sort by"
          value={sortBy}
          onChange={(v) => {
            setSortBy(v);
            resetPage();
          }}
          options={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <SelectMenu
          label="Order"
          value={sortOrder}
          onChange={(v) => {
            setSortOrder(v as "asc" | "desc");
            resetPage();
          }}
          options={[
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" },
          ]}
        />
      </div>

      <Alert message={error} />
      <Alert message={filterError} />
      {success ? <Alert message={success} type="success" /> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : tab === "stock" && stock ? (
        <StockView
          data={stock}
          onUpdated={() => {
            setSuccess("Stock quantity updated");
            load();
          }}
          onError={(msg) => setError(msg)}
        />
      ) : tab === "movements" ? (
        <MovementsView movements={movements} />
      ) : tab === "low-stock" && lowStock ? (
        <LowStockView data={lowStock} warehouseFilter={warehouseId} />
      ) : null}

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

function StackedHeader({ text, className }: { text: string; className?: string }) {
  const words = text.trim().split(/\s+/);
  return (
    <div className={`flex flex-col leading-tight ${className ?? ""}`}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="whitespace-nowrap">
          {word}
        </span>
      ))}
    </div>
  );
}

function LastChangeCell({
  change,
  updatedAt,
  stockUnit,
  unitsPerStockUnit,
  baseUnit,
}: {
  change?: StockLocationLastChange | null;
  updatedAt?: string | null;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
}) {
  const timingLabel = updatedAt
    ? new Date(updatedAt).toLocaleString("en-IN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : change
      ? new Date(change.createdAt).toLocaleString("en-IN", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  if (!change) {
    if (!timingLabel) {
      return <span className="text-base font-medium text-stone-300">—</span>;
    }
    return (
      <span className="text-[10px] font-medium text-stone-400">{timingLabel}</span>
    );
  }

  const unitFields = { stockUnit, unitsPerStockUnit, baseUnit };
  const isIn = change.type === "STOCK_IN";
  const split = splitBaseQuantity(change.quantity, unitFields);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        className={`inline-flex flex-col items-center rounded-xl px-2.5 py-1 text-sm font-bold tabular-nums ${
          isIn ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
        }`}
      >
        <span>
          {isIn ? "+" : "−"}
          {split.usesStockUnit
            ? ` ${split.fullUnits} ${pluralizeStockUnit(split.unitLabel, split.fullUnits)}`
            : ` ${change.quantity.toLocaleString()}`}
        </span>
        {split.usesStockUnit && split.loose > 0 ? (
          <span className="text-[10px] font-semibold">
            + {formatBaseUnits(split.loose, unitFields)}
          </span>
        ) : null}
      </div>
      {timingLabel ? (
        <span className="whitespace-nowrap text-[10px] font-medium text-stone-400">
          {timingLabel}
        </span>
      ) : null}
    </div>
  );
}

function toStockRow(product: StockProductRow, loc: StockProductRow["locations"][number]): StockRow {
  return {
    warehouseId: loc.warehouseId,
    warehouseName: loc.warehouseName,
    warehouseCode: loc.warehouseCode,
    productId: product.productId,
    productName: product.productName,
    secondaryProductName: product.secondaryProductName,
    brandId: product.brandId,
    brandName: product.brandName,
    stockUnit: product.stockUnit,
    unitsPerStockUnit: product.unitsPerStockUnit,
    baseUnit: product.baseUnit,
    quantity: loc.quantity,
    lowStockThreshold: loc.lowStockThreshold,
    warehouseLowStockThreshold: loc.warehouseLowStockThreshold,
    productLowStockThreshold: product.productLowStockThreshold,
    updatedAt: loc.updatedAt,
  };
}

function isWarehouseLow(row: Pick<StockRow, "quantity" | "lowStockThreshold">): boolean {
  return isWarehouseLowStock(row);
}

function StockView({
  data,
  onUpdated,
  onError,
}: {
  data: StockResponse;
  onUpdated: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<StockRow | null>(null);
  const warehouseColumns = data.warehouses?.length
    ? data.warehouses
    : data.summary.byWarehouse.map((w) => ({
        warehouseId: w.warehouseId,
        name: w.name,
        code: w.code,
      }));
  const products = data.products ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Products" value={data.summary.totalSkus} variant="info" />
        <StatCard
          label="Warehouses"
          value={data.summary.byWarehouse.length}
        />
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-orange-50 text-xs font-bold uppercase tracking-wide text-orange-800">
                <th className="sticky left-0 z-10 bg-orange-50 px-4 py-3.5 text-left align-bottom">
                  <StackedHeader text="Primary name" />
                </th>
                <th className="px-4 py-3.5 text-left align-bottom">
                  <StackedHeader text="Secondary name" />
                </th>
                <th className="px-4 py-3.5 text-left align-bottom">Brand</th>
                {warehouseColumns.map((wh) => (
                  <Fragment key={wh.warehouseId}>
                    <th className="px-4 py-3.5 text-left align-bottom">
                      <StackedHeader text={wh.name} className="font-bold" />
                    </th>
                    <th className="px-4 py-3.5 text-left align-bottom">
                      <div className="whitespace-nowrap font-bold">Last change</div>
                      <div className="mt-0.5 whitespace-nowrap text-[10px] font-semibold normal-case tracking-normal text-orange-600/80">
                        {wh.name}
                      </div>
                    </th>
                  </Fragment>
                ))}
                <th className="px-4 py-3.5 text-left align-bottom">Total</th>
                <th className="sticky right-0 z-10 whitespace-nowrap bg-orange-50 px-4 py-3.5 text-right align-bottom">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={warehouseColumns.length * 2 + 5}
                    className="px-5 py-10 text-center text-base font-medium text-stone-400"
                  >
                    No stock on hand
                  </td>
                </tr>
              ) : (
                products.map((product, index) => {
                  const locationByWarehouse = new Map(
                    product.locations.map((loc) => [loc.warehouseId, loc])
                  );
                  const stockedLocations = product.locations.filter((loc) => loc.quantity > 0);
                  return (
                    <tr
                      key={product.productId}
                      className={`border-t border-stone-100 transition-colors hover:bg-orange-50/50 ${
                        index % 2 === 0 ? "bg-white" : "bg-stone-50/40"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-3.5 font-semibold text-stone-900">
                        {stockedLocations[0] ? (
                          <ButtonLink
                            href={AUTH_ROUTES.adminInventoryItem(
                              stockedLocations[0].warehouseId,
                              product.productId
                            )}
                            variant="ghost"
                            size="sm"
                            className="!h-auto !min-h-0 !px-0 !py-0 !text-base !font-semibold !text-stone-900 hover:!text-orange-800 hover:!underline"
                          >
                            {product.productName}
                          </ButtonLink>
                        ) : (
                          product.productName
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-stone-600">
                        {formatSecondaryName(product.secondaryProductName)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-stone-600">{product.brandName}</td>
                      {warehouseColumns.map((wh) => {
                        const loc = locationByWarehouse.get(wh.warehouseId);
                        return (
                          <Fragment key={wh.warehouseId}>
                            <td className="px-4 py-3.5 text-left">
                              {loc ? (
                                <StockQuantityDisplay
                                  quantity={loc.quantity}
                                  stockUnit={product.stockUnit}
                                  unitsPerStockUnit={product.unitsPerStockUnit}
                                  baseUnit={product.baseUnit}
                                  size="lg"
                                  align="left"
                                />
                              ) : (
                                <span className="text-base font-medium text-stone-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-left">
                              <LastChangeCell
                                change={loc?.lastChange}
                                updatedAt={loc?.updatedAt}
                                stockUnit={product.stockUnit}
                                unitsPerStockUnit={product.unitsPerStockUnit}
                          baseUnit={product.baseUnit}
                              />
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-4 py-3.5 text-left">
                        <StockQuantityDisplay
                          quantity={product.totalQuantity}
                          stockUnit={product.stockUnit}
                          unitsPerStockUnit={product.unitsPerStockUnit}
                          baseUnit={product.baseUnit}
                          size="md"
                          align="left"
                          className="text-orange-800 [&_span:first-child]:!text-orange-800"
                        />
                      </td>
                      <td className="sticky right-0 z-10 w-px bg-inherit px-4 py-3.5 align-top">
                        <div className="flex flex-col items-stretch gap-2">
                          <ButtonLink
                            href={AUTH_ROUTES.adminReturn}
                            variant="outline"
                            size="sm"
                            className="!min-h-8 !justify-center !border-emerald-200 !text-emerald-800 hover:!bg-emerald-50"
                          >
                            Return
                          </ButtonLink>
                          {product.locations.map((loc) => {
                            const stockRow = toStockRow(product, loc);
                            return (
                              <div
                                key={loc.warehouseId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50/60 px-2 py-1.5"
                              >
                                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-stone-400">
                                  {loc.warehouseCode}
                                  {isWarehouseLow(stockRow) ? (
                                    <span className="ml-1 text-amber-700">· LOW</span>
                                  ) : null}
                                </span>
                                <div className="flex items-center gap-1">
                                  <ButtonLink
                                    href={AUTH_ROUTES.adminInventoryItem(
                                      loc.warehouseId,
                                      product.productId
                                    )}
                                    variant="ghost"
                                    size="sm"
                                    className="!min-h-8 !px-2 !py-1 !text-xs"
                                  >
                                    History
                                  </ButtonLink>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="!min-h-8 !px-2 !py-1 !text-xs"
                                    onClick={() => setEditing(stockRow)}
                                  >
                                    Update
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {products.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center text-base font-medium text-stone-400">
            No stock on hand
          </div>
        ) : (
          products.map((product) => {
            const locationByWarehouse = new Map(
              product.locations.map((loc) => [loc.warehouseId, loc])
            );
            const stockedLocations = product.locations.filter((loc) => loc.quantity > 0);
            const lastUpdated = product.locations.reduce<string | null>((latest, loc) => {
              if (!latest || new Date(loc.updatedAt) > new Date(latest)) {
                return loc.updatedAt;
              }
              return latest;
            }, null);
            return (
              <div
                key={product.productId}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-3">
                  <div className="min-w-0">
                    {stockedLocations[0] ? (
                      <ButtonLink
                        href={AUTH_ROUTES.adminInventoryItem(
                          stockedLocations[0].warehouseId,
                          product.productId
                        )}
                        variant="ghost"
                        size="sm"
                        className="!h-auto !min-h-0 !px-0 !py-0 !text-base !font-bold !text-stone-900 hover:!text-orange-800 hover:!underline"
                      >
                        {product.productName}
                      </ButtonLink>
                    ) : (
                      <span className="text-base font-bold text-stone-900">
                        {product.productName}
                      </span>
                    )}
                    <p className="mt-0.5 text-xs text-stone-500">
                      {product.brandName}
                      {product.secondaryProductName?.trim()
                        ? ` · ${product.secondaryProductName}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600/80">
                      Total
                    </p>
                    <StockQuantityDisplay
                      quantity={product.totalQuantity}
                      stockUnit={product.stockUnit}
                      unitsPerStockUnit={product.unitsPerStockUnit}
                      size="md"
                      align="right"
                      className="text-orange-800 [&_span:first-child]:!text-orange-800"
                    />
                  </div>
                </div>

                <div className="divide-y divide-stone-100">
                  {warehouseColumns.map((wh) => {
                    const loc = locationByWarehouse.get(wh.warehouseId);
                    const stockRow = loc ? toStockRow(product, loc) : null;
                    return (
                      <div key={wh.warehouseId} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-stone-700">
                              {wh.name}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                              {wh.code}
                              {stockRow && isWarehouseLow(stockRow) ? (
                                <span className="ml-1 text-amber-700">· LOW</span>
                              ) : null}
                            </p>
                            {stockRow?.lowStockThreshold != null ? (
                              <div className="text-[10px] text-stone-500">
                                Alert ≤{" "}
                                {lowStockSourceLabel(stockRow) === "warehouse" ? "custom " : "default "}
                                <StockQuantityDisplay
                                  quantity={stockRow.lowStockThreshold}
                                  stockUnit={product.stockUnit}
                                  unitsPerStockUnit={product.unitsPerStockUnit}
                                  baseUnit={product.baseUnit}
                                  size="sm"
                                  align="left"
                                  className="!inline-flex !flex-row !items-center !gap-1"
                                />
                              </div>
                            ) : null}
                          </div>
                          {loc ? (
                            <StockQuantityDisplay
                              quantity={loc.quantity}
                              stockUnit={product.stockUnit}
                              unitsPerStockUnit={product.unitsPerStockUnit}
                          baseUnit={product.baseUnit}
                              size="md"
                              align="right"
                            />
                          ) : (
                            <span className="text-base font-medium text-stone-300">—</span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <LastChangeCell
                            change={loc?.lastChange}
                            updatedAt={loc?.updatedAt}
                            stockUnit={product.stockUnit}
                            unitsPerStockUnit={product.unitsPerStockUnit}
                          baseUnit={product.baseUnit}
                          />
                          <div className="flex items-center gap-1.5">
                            <ButtonLink
                              href={AUTH_ROUTES.adminInventoryItem(
                                wh.warehouseId,
                                product.productId
                              )}
                              variant="ghost"
                              size="sm"
                              className="!min-h-8 !px-2.5 !py-1 !text-xs"
                            >
                              History
                            </ButtonLink>
                            {stockRow ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="!min-h-8 !px-2.5 !py-1 !text-xs"
                                onClick={() => setEditing(stockRow)}
                              >
                                Update
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3">
                  <span className="text-[11px] text-stone-400">
                    Updated{" "}
                    {lastUpdated
                      ? new Date(lastUpdated).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                  <ButtonLink
                    href={AUTH_ROUTES.adminReturn}
                    variant="outline"
                    size="sm"
                    className="!min-h-8 !border-emerald-200 !text-emerald-800 hover:!bg-emerald-50"
                  >
                    Return
                  </ButtonLink>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <AdjustStockDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={onUpdated}
          onError={onError}
        />
      )}
    </div>
  );
}

function AdjustStockDialog({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: StockRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const productUnits = {
    stockUnit: row.stockUnit,
    unitsPerStockUnit: row.unitsPerStockUnit,
    baseUnit: row.baseUnit,
  };
  const usesUnits = usesStockUnit(productUnits);
  const initialSplit = splitBaseQuantity(row.quantity, productUnits);

  const [fullUnits, setFullUnits] = useState(String(initialSplit.fullUnits));
  const [loose, setLoose] = useState(String(initialSplit.loose));
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [reason, setReason] = useState("");
  const [thresholdInput, setThresholdInput] = useState(
    row.warehouseLowStockThreshold != null ? String(row.warehouseLowStockThreshold) : ""
  );
  const [thresholdMode, setThresholdMode] = useState<QuantityEntryMode>(
    usesUnits ? "stockUnit" : "units"
  );
  const [saving, setSaving] = useState(false);

  const unitLabel = row.stockUnit?.trim() || "unit";
  const baseLabel = getBaseUnitLabel(productUnits);
  const thresholdPreview = formatThresholdPreview(
    thresholdBaseToDisplay(
      thresholdInput.trim() ? parseInt(thresholdInput, 10) : null,
      thresholdMode,
      productUnits
    ),
    thresholdMode,
    productUnits
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let qty: number;
    if (usesUnits) {
      const full = parseInt(fullUnits, 10);
      const looseQty = parseInt(loose, 10);
      if (Number.isNaN(full) || full < 0 || Number.isNaN(looseQty) || looseQty < 0) {
        onError("Enter valid carton and loose counts (0 or greater)");
        return;
      }
      const per = row.unitsPerStockUnit ?? 1;
      if (looseQty >= per) {
        onError(`Loose ${pluralizeStockUnit(baseLabel, 2)} must be less than ${per} (1 ${unitLabel})`);
        return;
      }
      qty = stockUnitsAndLooseToBase(full, looseQty, productUnits);
    } else {
      qty = parseInt(quantity, 10);
      if (Number.isNaN(qty) || qty < 0) {
        onError("Enter a valid quantity (0 or greater)");
        return;
      }
    }
    if (reason.trim().length > 0 && reason.trim().length < 3) {
      onError("Reason must be at least 3 characters if provided");
      return;
    }

    const trimmedReason = reason.trim();

    let thresholdValue: number | null;
    if (!thresholdInput.trim()) {
      thresholdValue = null;
    } else {
      const parsedThreshold = parseInt(thresholdInput, 10);
      if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
        onError("Enter a valid low-stock threshold (0 or greater)");
        return;
      }
      thresholdValue = parsedThreshold;
    }
    const currentOverride = row.warehouseLowStockThreshold ?? null;
    const thresholdChanged = thresholdValue !== currentOverride;

    setSaving(true);
    onError("");
    try {
      await api.inventory.adjustStock({
        warehouseId: row.warehouseId,
        productId: row.productId,
        brandId: row.brandId,
        quantity: qty,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      });
      if (thresholdChanged) {
        await api.inventory.updateLowStockThreshold({
          warehouseId: row.warehouseId,
          productId: row.productId,
          lowStockThreshold: thresholdValue,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to update warehouse stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-stock-title"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="adjust-stock-title" className="text-lg font-semibold text-zinc-900">
          Warehouse stock &amp; low-stock alert
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {row.productName}
          {row.secondaryProductName?.trim() ? ` · ${row.secondaryProductName}` : ""} ·{" "}
          {row.brandName} · {row.warehouseName}
        </p>
        <div className="mt-2 text-sm text-zinc-500">
          Current:{" "}
          <StockQuantityDisplay
            quantity={row.quantity}
            stockUnit={row.stockUnit}
            unitsPerStockUnit={row.unitsPerStockUnit}
            baseUnit={row.baseUnit}
            size="sm"
            className="mt-1"
          />
        </div>

        <div className="mt-4 space-y-3">
          {usesUnits ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">
                  {pluralizeStockUnit(unitLabel, 2)}
                </label>
                <input
                  type="number"
                  min={0}
                  value={fullUnits}
                  onChange={(e) => setFullUnits(e.target.value)}
                  className="form-input mt-1 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">
                  Loose {pluralizeStockUnit(baseLabel, 2)}
                </label>
                <input
                  type="number"
                  min={0}
                  max={(row.unitsPerStockUnit ?? 1) - 1}
                  value={loose}
                  onChange={(e) => setLoose(e.target.value)}
                  className="form-input mt-1 w-full"
                  required
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                New quantity ({pluralizeStockUnit(baseLabel, 2)})
              </label>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="form-input mt-1 w-full"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Physical count correction, damaged goods write-off"
              className="form-input mt-1 w-full resize-y"
            />
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <label className="block text-xs font-semibold text-amber-900">
              Low-stock alert for {row.warehouseCode}
            </label>
            <p className="mt-1 text-xs text-amber-800/90">
              Alert when quantity at this warehouse is at or below the threshold. Leave blank
              to use the product default
              {row.productLowStockThreshold != null
                ? ` (${formatBaseQuantityWithStockUnit(row.productLowStockThreshold, row)})`
                : ""}
              .
            </p>
            {usesUnits ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-amber-800/90">Alert threshold in</span>
                <ThresholdUnitToggle
                  mode={thresholdMode}
                  onModeChange={setThresholdMode}
                  product={productUnits}
                  size="sm"
                />
              </div>
            ) : null}
            <input
              type="number"
              min={0}
              step={thresholdMode === "stockUnit" && usesUnits ? "any" : 1}
              value={thresholdBaseToDisplay(
                thresholdInput.trim() ? parseInt(thresholdInput, 10) : null,
                thresholdMode,
                productUnits
              )}
              onChange={(e) => {
                const nextBase = thresholdDisplayToBase(
                  e.target.value,
                  thresholdMode,
                  productUnits
                );
                setThresholdInput(nextBase != null ? String(nextBase) : "");
              }}
              placeholder={
                row.productLowStockThreshold != null
                  ? thresholdBaseToDisplay(
                      row.productLowStockThreshold,
                      thresholdMode,
                      productUnits
                    ) || "e.g. 50"
                  : "e.g. 50"
              }
              className="form-input mt-2 w-full"
            />
            {thresholdPreview ? (
              <p className="mt-1 text-xs font-medium text-amber-800/80">{thresholdPreview}</p>
            ) : null}
            {row.lowStockThreshold != null && isWarehouseLow(row) ? (
              <p className="mt-2 text-xs font-semibold text-amber-800">
                Currently below threshold at this warehouse.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}

function MovementsView({ movements }: { movements: StockMovement[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <DataTable>
        <DataTableHead>
          <DataTableTh>Date</DataTableTh>
          <DataTableTh>Type</DataTableTh>
          <DataTableTh>Primary name</DataTableTh>
          <DataTableTh>Secondary name</DataTableTh>
          <DataTableTh>Brand</DataTableTh>
          <DataTableTh>Warehouse</DataTableTh>
          <DataTableTh>Details</DataTableTh>
          <DataTableTh align="right">Qty</DataTableTh>
        </DataTableHead>
        <DataTableBody>
          {movements.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                No movements
              </td>
            </tr>
          ) : (
            movements.map((m) => (
              <DataTableRow key={m.id}>
                <DataTableTd className="whitespace-nowrap text-zinc-500">
                  {new Date(m.createdAt).toLocaleString("en-IN", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </DataTableTd>
                <DataTableTd>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      m.type === "STOCK_IN"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {m.type === "STOCK_IN" ? "Stock In" : "Stock Out"}
                  </span>
                </DataTableTd>
                <DataTableTd className="font-medium">{m.product?.name}</DataTableTd>
                <DataTableTd className="text-zinc-600">
                  {formatSecondaryName(m.product?.secondaryName)}
                </DataTableTd>
                <DataTableTd className="text-zinc-600">{m.brand?.name}</DataTableTd>
                <DataTableTd>{m.warehouse?.code}</DataTableTd>
                <DataTableTd className="max-w-xs truncate text-xs text-zinc-500">
                  {m.dispatchType === "TRANSFER" &&
                    `Transfer → ${m.destinationWarehouse?.code}`}
                  {m.dispatchType === "DIRECT_SELLING" &&
                    `${m.clientName} · ${m.invoiceNumber}`}
                </DataTableTd>
                <DataTableTd align="right" className="font-semibold tabular-nums">
                  {m.quantity}
                </DataTableTd>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

function LowStockView({
  data,
  warehouseFilter,
}: {
  data: LowStockResponse;
  warehouseFilter?: string;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">By warehouse</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Each location uses its own threshold (or the product default).{" "}
            <strong>{data.count}</strong> warehouse rows match.
            {warehouseFilter ? (
              <span className="block text-xs text-zinc-500">
                Filtered to one warehouse — totals below still combine all locations.
              </span>
            ) : null}
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/30 shadow-sm">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Warehouse</DataTableTh>
              <DataTableTh>Primary name</DataTableTh>
              <DataTableTh>Secondary name</DataTableTh>
              <DataTableTh>Brand</DataTableTh>
              <DataTableTh align="right">Threshold</DataTableTh>
              <DataTableTh align="right">Quantity</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-600">
                    No warehouse-level low stock. Set thresholds on each product or per
                    warehouse in item history.
                  </td>
                </tr>
              ) : (
                data.items.map((r) => (
                  <DataTableRow key={`${r.warehouseId}-${r.productId}`}>
                    <DataTableTd>
                      {r.warehouseName} ({r.warehouseCode})
                    </DataTableTd>
                    <DataTableTd className="font-medium">{r.productName}</DataTableTd>
                    <DataTableTd className="text-zinc-600">
                      {formatSecondaryName(r.secondaryProductName)}
                    </DataTableTd>
                    <DataTableTd>{r.brandName}</DataTableTd>
                    <DataTableTd align="right" className="text-zinc-600">
                      {r.lowStockThreshold != null ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <StockQuantityDisplay
                            quantity={r.lowStockThreshold}
                            stockUnit={r.stockUnit}
                            unitsPerStockUnit={r.unitsPerStockUnit}
                            baseUnit={r.baseUnit}
                            size="sm"
                            align="right"
                          />
                          {r.warehouseLowStockThreshold != null ? (
                            <span className="text-[10px] text-amber-700">warehouse</span>
                          ) : (
                            <span className="text-[10px] text-zinc-400">default</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </DataTableTd>
                    <DataTableTd align="right" className="font-semibold text-amber-800">
                      <StockQuantityDisplay
                        quantity={r.quantity}
                        stockUnit={r.stockUnit}
                        unitsPerStockUnit={r.unitsPerStockUnit}
                        size="md"
                        align="right"
                        className="text-amber-800 [&_span:first-child]:!text-amber-800"
                      />
                    </DataTableTd>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Total across warehouses</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Sum of stock vs sum of per-warehouse thresholds.{" "}
            <strong>{data.totalCount}</strong> products are low in total.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-orange-200/80 bg-orange-50/20 shadow-sm">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Primary name</DataTableTh>
              <DataTableTh>Secondary name</DataTableTh>
              <DataTableTh>Brand</DataTableTh>
              <DataTableTh align="right">Total threshold</DataTableTh>
              <DataTableTh align="right">Total quantity</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {data.totals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                    No products are below their combined warehouse thresholds.
                  </td>
                </tr>
              ) : (
                data.totals.map((r) => (
                  <DataTableRow key={r.productId}>
                    <DataTableTd className="font-medium">{r.productName}</DataTableTd>
                    <DataTableTd className="text-zinc-600">
                      {formatSecondaryName(r.secondaryProductName)}
                    </DataTableTd>
                    <DataTableTd>{r.brandName}</DataTableTd>
                    <DataTableTd align="right" className="text-zinc-600">
                      <StockQuantityDisplay
                        quantity={r.totalLowStockThreshold}
                        stockUnit={r.stockUnit}
                        unitsPerStockUnit={r.unitsPerStockUnit}
                        baseUnit={r.baseUnit}
                        size="sm"
                        align="right"
                      />
                    </DataTableTd>
                    <DataTableTd align="right" className="font-semibold text-orange-800">
                      <StockQuantityDisplay
                        quantity={r.totalQuantity}
                        stockUnit={r.stockUnit}
                        unitsPerStockUnit={r.unitsPerStockUnit}
                        baseUnit={r.baseUnit}
                        size="md"
                        align="right"
                        className="text-orange-800 [&_span:first-child]:!text-orange-800"
                      />
                    </DataTableTd>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>
      </section>
    </div>
  );
}
