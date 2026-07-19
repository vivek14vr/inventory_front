"use client";

import {
  Fragment,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
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
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

export type CheckStockRoutes = {
  stockIn: string;
  returnPath: string;
  inventoryItem: (warehouseId: string, productId: string) => string;
};

const CheckStockRoutesContext = createContext<CheckStockRoutes | null>(null);

function useCheckStockRoutes(): CheckStockRoutes {
  const routes = useContext(CheckStockRoutesContext);
  if (!routes) {
    throw new Error("CheckStockPage routes are not configured");
  }
  return routes;
}

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
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import { createAdminInventoryProductSuggestions } from "@/lib/search/productSearchSuggestions";
import {
  validateNonNegativeInteger,
} from "@/lib/validation/quantity";
import {
  printCurrentStockReport,
  printLowStockReport,
  printMovementsReport,
  type CheckStockPdfFilters,
} from "@/lib/reports/checkStockPdf";
import {
  MOVEMENT_FILTER_KINDS,
  movementDetails,
  movementFilterKindLabel,
  movementTypeBadgeClass,
  movementTypeLabel,
} from "@/lib/inventory/movementDisplay";
import type {
  LowStockProductRow,
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

const TAB_LABELS: Record<Tab, string> = {
  stock: "Current stock",
  movements: "Movements",
  "low-stock": "Low stock",
};

const PDF_PAGE_LIMIT = 100;
const PDF_MAX_PAGES = 100;

async function fetchAllStockForPdf(
  base: Parameters<typeof api.inventory.stock>[0]
): Promise<StockResponse> {
  const products: StockProductRow[] = [];
  let data: StockResponse | null = null;

  for (let page = 1; page <= PDF_MAX_PAGES; page++) {
    const result = await api.inventory.stock({ ...base, page, limit: PDF_PAGE_LIMIT });
    if (!data) {
      data = result.data;
    }
    products.push(...(result.data.products ?? []));
    if (!result.pagination.hasNextPage) break;
  }

  if (!data) {
    throw new Error("No stock data to export");
  }

  return { ...data, products };
}

async function fetchAllMovementsForPdf(
  base: Parameters<typeof api.inventory.movements>[0]
): Promise<StockMovement[]> {
  const items: StockMovement[] = [];

  for (let page = 1; page <= PDF_MAX_PAGES; page++) {
    const result = await api.inventory.movements({ ...base, page, limit: PDF_PAGE_LIMIT });
    items.push(...result.items);
    if (!result.pagination.hasNextPage) break;
  }

  return items;
}

async function fetchAllLowStockForPdf(
  base: Parameters<typeof api.inventory.lowStock>[0]
): Promise<LowStockResponse> {
  const items: LowStockProductRow[] = [];
  let data: LowStockResponse | null = null;

  for (let page = 1; page <= PDF_MAX_PAGES; page++) {
    const result = await api.inventory.lowStock({ ...base, page, limit: PDF_PAGE_LIMIT });
    if (!data) {
      data = result.data;
    }
    items.push(...(result.data.items ?? []));
    if (!result.pagination.hasNextPage) break;
  }

  if (!data) {
    throw new Error("No low-stock data to export");
  }

  return { ...data, items, count: items.length };
}

function CheckStockPageContent() {
  const routes = useCheckStockRoutes();
  const { can, isAdmin, warehousesFor } = usePermissions();
  const showStockInAction = can(Permission.STOCK_IN);
  const canBrowseAllTabs = isAdmin || can(Permission.INVENTORY_VIEW);
  const allowedTabs = useMemo(() => {
    const tabs: Array<{ key: Tab; label: string }> = [];
    if (canBrowseAllTabs || can(Permission.STOCK_VIEW)) {
      tabs.push({ key: "stock", label: "Current stock" });
    }
    if (canBrowseAllTabs || can(Permission.STOCK_MOVEMENTS)) {
      tabs.push({ key: "movements", label: "Movements" });
    }
    if (canBrowseAllTabs || can(Permission.STOCK_LOW)) {
      tabs.push({ key: "low-stock", label: "Low stock" });
    }
    return tabs;
  }, [can, canBrowseAllTabs]);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab | null>(null);
  const activeTab: Tab = allowedTabs.some((t) => t.key === tab)
    ? (tab as Tab)
    : (allowedTabs[0]?.key ?? "stock");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
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
  const [lowStockQuantityMode, setLowStockQuantityMode] =
    useState<QuantityEntryMode>("stockUnit");
  const [pdfLoading, setPdfLoading] = useState(false);

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  /** Warehouses allowed for the active Check Stock tab (null = company-wide). */
  const allowedWarehouseIds = useMemo(() => {
    if (canBrowseAllTabs) return null;
    const code =
      activeTab === "stock"
        ? Permission.STOCK_VIEW
        : activeTab === "movements"
          ? Permission.STOCK_MOVEMENTS
          : Permission.STOCK_LOW;
    return new Set(warehousesFor(code));
  }, [canBrowseAllTabs, activeTab, warehousesFor]);

  const warehouseFilterOptions = useMemo(() => {
    if (!allowedWarehouseIds) return warehouses.filter((w) => w.isActive);
    return warehouses.filter((w) => w.isActive && allowedWarehouseIds.has(w.id));
  }, [warehouses, allowedWarehouseIds]);

  /** Never call APIs with a warehouse that isn't allowed for this tab. */
  const effectiveWarehouseId = useMemo(() => {
    if (!allowedWarehouseIds) return warehouseId;
    if (warehouseId && allowedWarehouseIds.has(warehouseId)) return warehouseId;
    if (allowedWarehouseIds.size === 1) return [...allowedWarehouseIds][0]!;
    return "";
  }, [allowedWarehouseIds, warehouseId]);

  useEffect(() => {
    if (!allowedWarehouseIds) return;
    if (warehouseId !== effectiveWarehouseId) {
      setWarehouseId(effectiveWarehouseId);
      resetPage();
    }
  }, [allowedWarehouseIds, warehouseId, effectiveWarehouseId, resetPage]);

  const fetchProductSuggestions = useMemo(
    () =>
      createAdminInventoryProductSuggestions(
        effectiveWarehouseId || undefined
      ),
    [effectiveWarehouseId]
  );

  useEffect(() => {
    if (activeTab === "stock") {
      if (!STOCK_SORT_OPTIONS.some((o) => o.value === sortBy)) {
        setSortBy("updatedAt");
        setSortOrder("desc");
      }
    } else if (activeTab === "movements") {
      if (!MOVEMENT_SORT_OPTIONS.some((o) => o.value === sortBy)) {
        setSortBy("createdAt");
        setSortOrder("desc");
      }
    } else if (!LOW_STOCK_SORT_OPTIONS.some((o) => o.value === sortBy)) {
      setSortBy("quantity");
      setSortOrder("asc");
    }
  }, [activeTab, sortBy]);

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
    if (allowedTabs.length === 0) {
      setLoading(false);
      setError("You do not have permission to view Check Stock tabs.");
      return;
    }
    if (allowedWarehouseIds && allowedWarehouseIds.size === 0) {
      setLoading(false);
      setError("No warehouse is granted for this Check Stock tab.");
      setStock(null);
      setMovements([]);
      setLowStock(null);
      setPagination(null);
      return;
    }
    // Wait until warehouse filter matches this tab (avoids Goregaon→Vasai race).
    if (
      allowedWarehouseIds &&
      warehouseId &&
      !allowedWarehouseIds.has(warehouseId)
    ) {
      return;
    }
    const sortValid =
      activeTab === "stock"
        ? STOCK_SORT_OPTIONS.some((o) => o.value === sortBy)
        : activeTab === "movements"
          ? MOVEMENT_SORT_OPTIONS.some((o) => o.value === sortBy)
          : LOW_STOCK_SORT_OPTIONS.some((o) => o.value === sortBy);
    if (!sortValid) return;
    setLoading(true);
    setError("");
    try {
      const scopedWarehouseId = effectiveWarehouseId;
      const base = {
        page,
        limit,
        sortBy,
        sortOrder,
        includeZero: true,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(scopedWarehouseId ? { warehouseId: scopedWarehouseId } : {}),
        ...(brandId ? { brandId } : {}),
      };

      if (activeTab === "stock") {
        const result = await api.inventory.stock(base);
        setStock(result.data);
        setPagination(result.pagination);
      } else if (activeTab === "movements") {
        const result = await api.inventory.movements({
          ...base,
          ...(movementType ? { kind: movementType } : {}),
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
  }, [
    allowedTabs.length,
    allowedWarehouseIds,
    activeTab,
    warehouseId,
    effectiveWarehouseId,
    brandId,
    movementType,
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  ]);

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

    if (!canBrowseAllTabs) {
      const code =
        next === "stock"
          ? Permission.STOCK_VIEW
          : next === "movements"
            ? Permission.STOCK_MOVEMENTS
            : Permission.STOCK_LOW;
      const allowed = warehousesFor(code);
      if (!warehouseId || !allowed.includes(warehouseId)) {
        setWarehouseId(allowed.length === 1 ? allowed[0]! : "");
      }
    }

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
    activeTab === "stock"
      ? STOCK_SORT_OPTIONS
      : activeTab === "movements"
        ? MOVEMENT_SORT_OPTIONS
        : LOW_STOCK_SORT_OPTIONS;

  function buildPdfFilters(): CheckStockPdfFilters {
    return {
      tab: activeTab,
      tabLabel: TAB_LABELS[activeTab],
      warehouseName: warehouses.find((w) => w.id === warehouseId)?.name,
      brandName: brands.find((b) => b.id === brandId)?.name,
      search: search.trim() || undefined,
      movementType: movementType || undefined,
      sortBy,
      sortOrder,
    };
  }

  async function downloadPdf() {
    setPdfLoading(true);
    setError("");
    try {
      const base = {
        sortBy,
        sortOrder,
        includeZero: true,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        ...(brandId ? { brandId } : {}),
      };
      const filters = buildPdfFilters();

      if (activeTab === "stock") {
        const data = await fetchAllStockForPdf(base);
        printCurrentStockReport(data, {
          filters,
          showTotalColumn: !warehouseId,
        });
      } else if (activeTab === "movements") {
        const items = await fetchAllMovementsForPdf({
          ...base,
          ...(movementType ? { kind: movementType } : {}),
        });
        printMovementsReport(items, filters);
      } else {
        const data = await fetchAllLowStockForPdf(base);
        printLowStockReport(data, filters, lowStockQuantityMode);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Inventory & stock"
        description="View stock levels and set a different low-stock alert for each warehouse."
        actions={
          showStockInAction ? (
            <ButtonLink href={routes.stockIn} size="sm">
              Stock in
            </ButtonLink>
          ) : undefined
        }
      />

      {allowedTabs.length > 0 ? (
        <div
          className={`grid gap-3 ${
            allowedTabs.length === 1
              ? "grid-cols-1"
              : allowedTabs.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {allowedTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTabChange(key)}
              className={`min-h-14 rounded-2xl border-2 px-5 py-3.5 text-base font-bold transition active:scale-[0.98] ${
                activeTab === key
                  ? "border-orange-600 bg-orange-600 text-white shadow-md shadow-orange-900/20"
                  : "border-stone-200 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-4 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <FilterField label="Search" className="min-w-0 flex-1 lg:max-w-xl">
            <SearchInputWithSuggestions
              value={search}
              onChange={(value) => {
                setSearch(value);
                resetPage();
              }}
              onSelect={(suggestion) => {
                setSearch(suggestion.searchTerm);
                resetPage();
              }}
              fetchSuggestions={fetchProductSuggestions}
              placeholder="Product, brand, warehouse…"
              ariaLabel="Search inventory"
              inputClassName="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 pl-10 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              emptyMessage={(term) => `No products match “${term}”`}
            />
          </FilterField>
          <FilterSelect
            label="Warehouse"
            className="w-full shrink-0 lg:w-auto lg:min-w-[14rem]"
            value={warehouseId}
            onChange={(v) => handleFilterChange(setWarehouseId, v)}
            options={[
              ...(warehouseFilterOptions.length > 1
                ? [{ value: "", label: "All" }]
                : []),
              ...warehouseFilterOptions.map((w) => ({
                value: w.id,
                label: w.name,
              })),
            ]}
          />
          {activeTab === "movements" ? (
            <FilterSelect
              label="Type"
              className="w-full shrink-0 lg:w-auto lg:min-w-[12rem]"
              value={movementType}
              onChange={(v) => handleFilterChange(setMovementType, v)}
              options={[
                { value: "", label: "All" },
                ...MOVEMENT_FILTER_KINDS.map((k) => ({
                  value: k.value,
                  label: k.label,
                })),
              ]}
            />
          ) : null}
        </div>

        <FilterSelect
          label="Brand"
          className="w-full"
          optionsClassName="max-h-36 overflow-y-auto pr-1"
          value={brandId}
          onChange={(v) => handleFilterChange(setBrandId, v)}
          options={[
            { value: "", label: "All" },
            ...brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />

        <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4">
          <SelectMenu
            label="Sort by"
            className="min-w-[10rem]"
            value={sortBy}
            onChange={(v) => {
              setSortBy(v);
              resetPage();
            }}
            options={sortOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SelectMenu
            label="Order"
            className="min-w-[9rem]"
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
          {activeTab === "low-stock" ? (
            <div className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">Quantities in</span>
              <ThresholdUnitToggle
                mode={lowStockQuantityMode}
                onModeChange={setLowStockQuantityMode}
                product={
                  lowStock?.items.find((item) => usesStockUnit(item)) ??
                  lowStock?.items[0] ??
                  null
                }
                size="sm"
                alwaysShow
                fallbackStockUnitLabel="Boxes"
                fallbackBaseUnitLabel="Units"
              />
            </div>
          ) : null}
          <div className="ml-auto flex shrink-0 items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={pdfLoading}
              disabled={loading}
              onClick={() => void downloadPdf()}
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <Alert message={error} />
      <Alert message={filterError} />
      {success ? <Alert message={success} type="success" /> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : activeTab === "stock" && stock ? (
        <StockView
          data={stock}
          showTotalColumn={!warehouseId}
          onUpdated={() => {
            setSuccess("Stock quantity updated");
            load();
          }}
          onError={(msg) => setError(msg)}
        />
      ) : activeTab === "movements" ? (
        <MovementsView movements={movements} />
      ) : activeTab === "low-stock" ? (
        <LowStockView
          data={
            lowStock ?? {
              count: 0,
              warehouses: [],
              items: [],
            }
          }
          quantityMode={lowStockQuantityMode}
        />
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

function ProductDetailCell({
  product,
  linkWarehouseId,
}: {
  product: StockProductRow;
  linkWarehouseId?: string;
}) {
  const routes = useCheckStockRoutes();
  const primaryName = product.productName;
  const secondaryName = product.secondaryProductName?.trim();
  const nameClassName = "text-base font-semibold text-stone-900";

  return (
    <div className="min-w-[10rem] max-w-xs">
      {linkWarehouseId ? (
        <ButtonLink
          href={routes.inventoryItem(linkWarehouseId, product.productId)}
          variant="ghost"
          size="sm"
          className="!h-auto !min-h-0 !px-0 !py-0 !text-base !font-semibold !text-stone-900 hover:!text-orange-800 hover:!underline"
        >
          {primaryName}
        </ButtonLink>
      ) : (
        <p className={nameClassName}>{primaryName}</p>
      )}
      <p className="mt-0.5 text-sm text-stone-600">
        {secondaryName ? formatSecondaryName(secondaryName) : "—"}
      </p>
      <p className="mt-1.5">
        <span className="inline-flex max-w-full items-center rounded-md border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800">
          {product.brandName}
        </span>
      </p>
    </div>
  );
}

function StockView({
  data,
  showTotalColumn = true,
  onUpdated,
  onError,
}: {
  data: StockResponse;
  showTotalColumn?: boolean;
  onUpdated: () => void;
  onError: (message: string) => void;
}) {
  const routes = useCheckStockRoutes();
  const { can, isAdmin } = usePermissions();
  const showActionsColumn = isAdmin || can(Permission.STOCK_ACTIONS);
  const showAdjustActions = can(Permission.INVENTORY_ADJUST);
  const showReturnActions = can(Permission.RETURNS_CLIENT);
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
                  Product detail
                </th>
                {showTotalColumn ? (
                  <th className="px-4 py-3.5 text-left align-bottom">Total</th>
                ) : null}
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
                {showActionsColumn ? (
                  <th className="sticky right-0 z-10 whitespace-nowrap bg-orange-50 px-4 py-3.5 text-right align-bottom">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      warehouseColumns.length * 2 +
                      (showTotalColumn ? 2 : 1) +
                      (showActionsColumn ? 1 : 0)
                    }
                    className="px-5 py-10 text-center text-base font-medium text-stone-400"
                  >
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product, index) => {
                  const locationByWarehouse = new Map(
                    product.locations.map((loc) => [loc.warehouseId, loc])
                  );
                  const stockedLocations = product.locations.filter((loc) => loc.quantity > 0);
                  const detailLinkLocation = stockedLocations[0] ?? product.locations[0];
                  return (
                    <tr
                      key={product.productId}
                      className={`border-t border-stone-100 transition-colors hover:bg-orange-50/50 ${
                        index % 2 === 0 ? "bg-white" : "bg-stone-50/40"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-3.5 align-top">
                        <ProductDetailCell
                          product={product}
                          linkWarehouseId={detailLinkLocation?.warehouseId}
                        />
                      </td>
                      {showTotalColumn ? (
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
                      ) : null}
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
                      {showActionsColumn ? (
                      <td className="sticky right-0 z-10 w-px bg-inherit px-4 py-3.5 align-top">
                        <div className="flex flex-col items-stretch gap-2">
                          {showReturnActions ? (
                          <ButtonLink
                            href={`${routes.returnPath}?warehouseId=${encodeURIComponent(detailLinkLocation?.warehouseId ?? "")}`}
                            variant="outline"
                            size="sm"
                            className="!min-h-8 !justify-center !border-emerald-200 !text-emerald-800 hover:!bg-emerald-50"
                          >
                            Return
                          </ButtonLink>
                          ) : null}
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
                                    href={routes.inventoryItem(
                                      loc.warehouseId,
                                      product.productId
                                    )}
                                    variant="ghost"
                                    size="sm"
                                    className="!min-h-8 !px-2 !py-1 !text-xs"
                                  >
                                    History
                                  </ButtonLink>
                                  {showAdjustActions ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="!min-h-8 !px-2 !py-1 !text-xs"
                                    onClick={() => setEditing(stockRow)}
                                  >
                                    Update
                                  </Button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      ) : null}
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
                    No products found
          </div>
        ) : (
          products.map((product) => {
            const locationByWarehouse = new Map(
              product.locations.map((loc) => [loc.warehouseId, loc])
            );
            const stockedLocations = product.locations.filter((loc) => loc.quantity > 0);
            const detailLinkLocation = stockedLocations[0] ?? product.locations[0];
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
                  <ProductDetailCell
                    product={product}
                    linkWarehouseId={detailLinkLocation?.warehouseId}
                  />
                  {showTotalColumn ? (
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
                  ) : null}
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
                            {showActionsColumn ? (
                            <ButtonLink
                              href={routes.inventoryItem(
                                wh.warehouseId,
                                product.productId
                              )}
                              variant="ghost"
                              size="sm"
                              className="!min-h-8 !px-2.5 !py-1 !text-xs"
                            >
                              History
                            </ButtonLink>
                            ) : null}
                            {showActionsColumn && stockRow && showAdjustActions ? (
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
                  {showActionsColumn && showReturnActions ? (
                  <ButtonLink
                    href={`${routes.returnPath}?warehouseId=${encodeURIComponent(detailLinkLocation?.warehouseId ?? "")}`}
                    variant="outline"
                    size="sm"
                    className="!min-h-8 !border-emerald-200 !text-emerald-800 hover:!bg-emerald-50"
                  >
                    Return
                  </ButtonLink>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && showAdjustActions ? (
        <AdjustStockDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={onUpdated}
          onError={onError}
        />
      ) : null}
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
      if (Number.isNaN(full) || Number.isNaN(looseQty)) {
        onError("Enter valid carton and loose counts");
        return;
      }
      const fullError = validateNonNegativeInteger(full, "Carton count");
      const looseError = validateNonNegativeInteger(looseQty, "Loose count");
      if (fullError || looseError) {
        onError(fullError ?? looseError ?? "Quantity cannot be negative");
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
      const qtyError = validateNonNegativeInteger(qty);
      if (Number.isNaN(qty) || qtyError) {
        onError(qtyError ?? "Enter a valid quantity (0 or greater)");
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
      const thresholdError = validateNonNegativeInteger(parsedThreshold, "Low-stock threshold");
      if (!Number.isFinite(parsedThreshold) || thresholdError) {
        onError(thresholdError ?? "Enter a valid low-stock threshold (0 or greater)");
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
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");

  const toggleProduct = useMemo(() => {
    const movement = movements.find((item) => usesStockUnit(item.product));
    return movement?.product ?? null;
  }, [movements]);

  const showQuantityToggle = movements.some((item) => usesStockUnit(item.product));

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <DataTable>
        <DataTableHead>
          <DataTableTh>Date</DataTableTh>
          <DataTableTh>Type</DataTableTh>
          <DataTableTh>Product</DataTableTh>
          <DataTableTh>Brand</DataTableTh>
          <DataTableTh>Warehouse</DataTableTh>
          <DataTableTh>Details</DataTableTh>
          <DataTableTh align="right">
            <div className="flex flex-col items-end gap-2">
              <span>Qty</span>
              {showQuantityToggle ? (
                <ThresholdUnitToggle
                  mode={quantityMode}
                  onModeChange={setQuantityMode}
                  product={toggleProduct}
                  size="sm"
                />
              ) : null}
            </div>
          </DataTableTh>
          <DataTableTh align="right">Remaining stock</DataTableTh>
        </DataTableHead>
        <DataTableBody>
          {movements.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                No movements
              </td>
            </tr>
          ) : (
            movements.map((m) => {
              const secondary = formatSecondaryName(m.product?.secondaryName);
              return (
                <DataTableRow key={m.id}>
                  <DataTableTd className="whitespace-nowrap text-zinc-500">
                    {new Date(m.createdAt).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </DataTableTd>
                  <DataTableTd>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${movementTypeBadgeClass(m)}`}
                    >
                      {movementTypeLabel(m)}
                    </span>
                  </DataTableTd>
                  <DataTableTd>
                    <p className="font-medium text-stone-900">{m.product?.name ?? "—"}</p>
                    {secondary !== "—" ? (
                      <p className="mt-0.5 text-xs text-zinc-500">{secondary}</p>
                    ) : null}
                  </DataTableTd>
                  <DataTableTd className="text-zinc-600">{m.brand?.name}</DataTableTd>
                  <DataTableTd>{m.warehouse?.code}</DataTableTd>
                  <DataTableTd className="max-w-xs truncate text-xs text-zinc-500">
                    {movementDetails(m)}
                  </DataTableTd>
                  <DataTableTd align="right" className="font-semibold tabular-nums">
                    {(() => {
                      const isIn = m.type === "STOCK_IN";
                      const leadingSign = isIn ? "+" : "−";
                      const tone = isIn ? "in" : "out";
                      if (quantityMode === "units" || !usesStockUnit(m.product)) {
                        return (
                          <span
                            className={`whitespace-nowrap ${
                              isIn ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {leadingSign}
                            {formatBaseUnits(m.quantity, m.product)}
                          </span>
                        );
                      }
                      return (
                        <StockQuantityDisplay
                          quantity={m.quantity}
                          stockUnit={m.product?.stockUnit}
                          unitsPerStockUnit={m.product?.unitsPerStockUnit}
                          baseUnit={m.product?.baseUnit}
                          size="sm"
                          align="right"
                          leadingSign={leadingSign}
                          tone={tone}
                        />
                      );
                    })()}
                  </DataTableTd>
                  <DataTableTd align="right" className="tabular-nums text-stone-700">
                    {typeof m.remainingStock !== "number" ? (
                      <span className="text-stone-300">—</span>
                    ) : quantityMode === "units" || !usesStockUnit(m.product) ? (
                      <span className="whitespace-nowrap">
                        {formatBaseUnits(m.remainingStock, m.product)}
                      </span>
                    ) : (
                      <StockQuantityDisplay
                        quantity={m.remainingStock}
                        stockUnit={m.product?.stockUnit}
                        unitsPerStockUnit={m.product?.unitsPerStockUnit}
                        baseUnit={m.product?.baseUnit}
                        size="sm"
                        align="right"
                      />
                    )}
                  </DataTableTd>
                </DataTableRow>
              );
            })
          )}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

function normalizeLowStockProduct(row: LowStockProductRow): Required<
  Pick<
    LowStockProductRow,
    | "warehouseLow"
    | "warehouseThreshold"
    | "warehouseThresholdCustom"
  >
> &
  LowStockProductRow {
  const legacy = row as LowStockProductRow & {
    warehouseId?: string;
    quantity?: number;
    lowStockThreshold?: number;
    warehouseLowStockThreshold?: number;
  };

  if (
    legacy.warehouseId &&
    (!row.warehouseLow || Object.keys(row.warehouseLow).length === 0)
  ) {
    return {
      ...row,
      warehouseLow: {
        [legacy.warehouseId]: legacy.quantity ?? 0,
      },
      warehouseThreshold:
        legacy.lowStockThreshold != null
          ? { [legacy.warehouseId]: legacy.lowStockThreshold }
          : {},
      warehouseThresholdCustom:
        legacy.warehouseLowStockThreshold != null
          ? { [legacy.warehouseId]: true }
          : {},
    };
  }

  return {
    ...row,
    warehouseLow: row.warehouseLow ?? {},
    warehouseThreshold: row.warehouseThreshold ?? {},
    warehouseThresholdCustom: row.warehouseThresholdCustom ?? {},
  };
}

function LowStockThresholdCell({
  threshold,
  product,
  mode,
  source,
}: {
  threshold: number | undefined;
  product: Pick<StockProductRow, "stockUnit" | "unitsPerStockUnit" | "baseUnit">;
  mode: QuantityEntryMode;
  source?: "overall" | "warehouse" | "default";
}) {
  if (threshold === undefined) {
    return <span className="text-base font-medium text-stone-300">—</span>;
  }

  const unitFields = {
    stockUnit: product.stockUnit,
    unitsPerStockUnit: product.unitsPerStockUnit,
    baseUnit: product.baseUnit,
  };

  const sourceLabel =
    source === "overall"
      ? "overall"
      : source === "warehouse"
        ? "warehouse"
        : source === "default"
          ? "default"
          : null;

  return (
    <div className="flex flex-col items-start gap-0.5">
      {mode === "units" || !usesStockUnit(product) ? (
        <span className="text-xs font-medium tabular-nums text-stone-500">
          ≤ {formatBaseUnits(threshold, unitFields)}
        </span>
      ) : (
        <div className="flex items-baseline gap-1 text-xs text-stone-500">
          <span>≤</span>
          <StockQuantityDisplay
            quantity={threshold}
            stockUnit={product.stockUnit}
            unitsPerStockUnit={product.unitsPerStockUnit}
            baseUnit={product.baseUnit}
            size="sm"
            align="left"
            className="text-stone-500 [&_span:first-child]:!text-stone-500"
          />
        </div>
      )}
      {sourceLabel ? (
        <span className="text-[10px] text-stone-400">{sourceLabel}</span>
      ) : null}
    </div>
  );
}
function toLowStockProductDetail(row: LowStockProductRow): StockProductRow {
  return {
    productId: row.productId,
    productName: row.productName,
    secondaryProductName: row.secondaryProductName,
    brandId: row.brandId,
    brandName: row.brandName,
    stockUnit: row.stockUnit,
    unitsPerStockUnit: row.unitsPerStockUnit,
    baseUnit: row.baseUnit,
    locations: [],
    totalQuantity: row.totalQuantity,
    totalLowStockThreshold: row.totalLowStockThreshold ?? 0,
  };
}

function LowStockQuantityCell({
  quantity,
  product,
  mode,
  variant = "warehouse",
  size = "lg",
}: {
  quantity: number | undefined;
  product: Pick<StockProductRow, "stockUnit" | "unitsPerStockUnit" | "baseUnit">;
  mode: QuantityEntryMode;
  variant?: "total" | "warehouse" | "neutral";
  size?: "sm" | "md" | "lg";
}) {
  if (quantity === undefined) {
    return <span className="text-base font-medium text-stone-300">—</span>;
  }

  const highlightClass =
    variant === "total"
      ? "text-orange-800 [&_span:first-child]:!text-orange-800"
      : variant === "neutral"
        ? "text-stone-900 [&_span:first-child]:!text-stone-900"
        : "text-amber-800 [&_span:first-child]:!text-amber-800";
  const plainClass =
    variant === "total"
      ? "text-orange-800"
      : variant === "neutral"
        ? "text-stone-900"
        : "text-amber-800";

  if (mode === "units" || !usesStockUnit(product)) {
    return (
      <span className={`text-base font-semibold tabular-nums ${plainClass}`}>
        {formatBaseUnits(quantity, product)}
      </span>
    );
  }

  return (
    <StockQuantityDisplay
      quantity={quantity}
      stockUnit={product.stockUnit}
      unitsPerStockUnit={product.unitsPerStockUnit}
      baseUnit={product.baseUnit}
      size={size}
      align="left"
      className={highlightClass}
    />
  );
}

function LowStockView({
  data,
  quantityMode,
}: {
  data: LowStockResponse;
  quantityMode: QuantityEntryMode;
}) {
  const warehouseColumns = data.warehouses ?? [];
  const products = data.items ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-orange-50 text-xs font-bold uppercase tracking-wide text-orange-800">
              <th className="sticky left-0 z-10 bg-orange-50 px-4 py-3.5 text-left align-bottom">
                Product detail
              </th>
              <th className="px-4 py-3.5 text-left align-bottom">Total stock</th>
              {warehouseColumns.map((wh) => (
                <th
                  key={wh.warehouseId}
                  className="px-4 py-3.5 text-left align-bottom"
                >
                  <StackedHeader text={wh.name} className="font-bold" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={warehouseColumns.length + 2}
                  className="px-5 py-10 text-center text-base font-medium text-stone-400"
                >
                  No low stock. Set thresholds on each product or per warehouse in item
                  history.
                </td>
              </tr>
            ) : (
              products.map((productRow, index) => {
                const product = normalizeLowStockProduct(productRow);
                const detailProduct = toLowStockProductDetail(product);
                const lowWarehouseIds = Object.keys(product.warehouseLow);
                const detailLinkWarehouseId = lowWarehouseIds[0];
                return (
                  <tr
                    key={product.productId}
                    className={`border-t border-stone-100 transition-colors hover:bg-orange-50/50 ${
                      index % 2 === 0 ? "bg-white" : "bg-stone-50/40"
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-3.5 align-top">
                      <ProductDetailCell
                        product={detailProduct}
                        linkWarehouseId={detailLinkWarehouseId}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-left align-top">
                      <div className="flex flex-col items-start gap-1">
                        <LowStockQuantityCell
                          quantity={product.totalQuantity}
                          product={detailProduct}
                          mode={quantityMode}
                          variant={product.isTotalLow ? "total" : "neutral"}
                          size="md"
                        />
                        <LowStockThresholdCell
                          threshold={product.totalLowStockThreshold}
                          product={detailProduct}
                          mode={quantityMode}
                          source={
                            product.totalLowStockThreshold != null ? "overall" : undefined
                          }
                        />
                      </div>
                    </td>
                    {warehouseColumns.map((wh) => (
                      <td
                        key={wh.warehouseId}
                        className="px-4 py-3.5 text-left align-top"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <LowStockQuantityCell
                            quantity={product.warehouseLow[wh.warehouseId]}
                            product={detailProduct}
                            mode={quantityMode}
                          />
                          <LowStockThresholdCell
                            threshold={product.warehouseThreshold[wh.warehouseId]}
                            product={detailProduct}
                            mode={quantityMode}
                            source={
                              product.warehouseThreshold[wh.warehouseId] != null
                                ? product.warehouseThresholdCustom[wh.warehouseId]
                                  ? "warehouse"
                                  : "default"
                                : undefined
                            }
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CheckStockPage({ routes }: { routes: CheckStockRoutes }) {
  return (
    <CheckStockRoutesContext.Provider value={routes}>
      <Suspense fallback={<LoadingSpinner label="Loading…" />}>
        <CheckStockPageContent />
      </Suspense>
    </CheckStockRoutesContext.Provider>
  );
}
