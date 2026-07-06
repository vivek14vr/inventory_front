"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { usePagination } from "@/hooks/usePagination";
import type { PaginationMeta } from "@/types/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";
import { formatSecondaryName } from "@/lib/products/productNames";
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import { createAppInventoryProductSuggestions } from "@/lib/search/productSearchSuggestions";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type { InventoryBalance } from "@/types/stock";
import type { StockProductRow } from "@/types/inventory";
import { getPrimaryWarehouseId } from "@/lib/auth/warehouseContext";

function AppInventoryPageContent() {
  const { user } = useAuth();
  const { can, canAny } = usePermissions();
  const warehouseId = getPrimaryWarehouseId(user) ?? "";
  const useWarehouseBalances = canAny([
    Permission.STOCK_VIEW,
    Permission.STOCK_IN,
    Permission.STOCK_OUT,
  ]);
  const useCompanyInventory = can(Permission.INVENTORY_VIEW);
  const canToggleInventoryView = useWarehouseBalances && useCompanyInventory;
  const [inventoryView, setInventoryView] = useState<"warehouse" | "company">(
    useWarehouseBalances ? "warehouse" : "company"
  );
  const activeCompanyView = canToggleInventoryView
    ? inventoryView === "company"
    : useCompanyInventory && !useWarehouseBalances;
  const activeWarehouseView = canToggleInventoryView
    ? inventoryView === "warehouse"
    : useWarehouseBalances;

  const searchParams = useSearchParams();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [companyProducts, setCompanyProducts] = useState<StockProductRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const fetchProductSuggestions = useMemo(
    () => createAppInventoryProductSuggestions(),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (activeWarehouseView) {
        const result = await api.stock.balances({
          page,
          limit,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(warehouseId ? { warehouseId } : {}),
        });
        setBalances(result.items);
        setCompanyProducts([]);
        setPagination(result.pagination);
      } else if (activeCompanyView) {
        const result = await api.inventory.stock({
          page,
          limit,
          includeZero: true,
          ...(search.trim() ? { search: search.trim() } : {}),
        });
        setCompanyProducts(result.data.products);
        setBalances([]);
        setPagination(result.pagination);
      } else {
        setBalances([]);
        setCompanyProducts([]);
        setPagination(null);
        setError("You do not have permission to view stock");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    search,
    warehouseId,
    activeWarehouseView,
    activeCompanyView,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Current stock"
        description={
          activeCompanyView
            ? "Company-wide stock totals across warehouses"
            : "Warehouse inventory by product and brand"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canToggleInventoryView ? (
              <div className="flex rounded-xl border border-zinc-200 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setInventoryView("warehouse");
                    resetPage();
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    inventoryView === "warehouse"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  My warehouse
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInventoryView("company");
                    resetPage();
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    inventoryView === "company"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  Company-wide
                </button>
              </div>
            ) : null}
            <button
              onClick={load}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <label className="block text-xs font-medium text-zinc-500">Search</label>
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
          placeholder="Product or brand…"
          ariaLabel="Search inventory"
          inputClassName="mt-1 w-full max-w-md rounded-lg border border-zinc-200 px-3 py-2 pl-10 text-sm"
          emptyMessage={(term) => `No products match “${term}”`}
        />
      </div>

      <Alert message={error} />

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <DataTable>
          <DataTableHead>
            <DataTableTh>Primary name</DataTableTh>
            <DataTableTh>Secondary name</DataTableTh>
            <DataTableTh>Brand</DataTableTh>
            <DataTableTh align="right">Quantity</DataTableTh>
            <DataTableTh>Last updated</DataTableTh>
          </DataTableHead>
          <DataTableBody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : balances.length === 0 && companyProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No products found.
                </td>
              </tr>
            ) : balances.length > 0 ? (
              balances.map((b) => (
                <DataTableRow key={`${b.productId}-${b.brandId}`}>
                  <DataTableTd className="font-medium text-zinc-900">
                    {b.productName}
                  </DataTableTd>
                  <DataTableTd className="text-zinc-600">
                    {formatSecondaryName(b.secondaryProductName)}
                  </DataTableTd>
                  <DataTableTd className="text-zinc-600">{b.brandName}</DataTableTd>
                  <DataTableTd align="right">
                    <StockQuantityDisplay
                      quantity={b.quantity}
                      stockUnit={b.stockUnit}
                      unitsPerStockUnit={b.unitsPerStockUnit}
                      baseUnit={b.baseUnit}
                      size="md"
                      align="right"
                    />
                  </DataTableTd>
                  <DataTableTd className="text-zinc-500">
                    {b.updatedAt
                      ? new Date(b.updatedAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </DataTableTd>
                </DataTableRow>
              ))
            ) : (
              companyProducts.map((product) => (
                <DataTableRow key={product.productId}>
                  <DataTableTd className="font-medium text-zinc-900">
                    {product.productName}
                  </DataTableTd>
                  <DataTableTd className="text-zinc-600">
                    {formatSecondaryName(product.secondaryProductName)}
                  </DataTableTd>
                  <DataTableTd className="text-zinc-600">{product.brandName}</DataTableTd>
                  <DataTableTd align="right">
                    <StockQuantityDisplay
                      quantity={product.totalQuantity}
                      stockUnit={product.stockUnit}
                      unitsPerStockUnit={product.unitsPerStockUnit}
                      baseUnit={product.baseUnit}
                      size="md"
                      align="right"
                    />
                  </DataTableTd>
                  <DataTableTd className="text-zinc-500">
                    {(() => {
                      const times = product.locations
                        .map((loc) => new Date(loc.updatedAt).getTime())
                        .filter((time) => Number.isFinite(time) && time > 0);
                      if (times.length === 0) return "—";
                      return new Date(Math.max(...times)).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      });
                    })()}
                  </DataTableTd>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>

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

export default function AppInventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading inventory…" />
        </div>
      }
    >
      <AppInventoryPageContent />
    </Suspense>
  );
}
