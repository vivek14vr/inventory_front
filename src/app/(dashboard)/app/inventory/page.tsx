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
import { formatSecondaryName } from "@/lib/products/productNames";
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import { createAppInventoryProductSuggestions } from "@/lib/search/productSearchSuggestions";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type { InventoryBalance } from "@/types/stock";

function AppInventoryPageContent() {
  const searchParams = useSearchParams();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
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
      const result = await api.stock.balances({
        page,
        limit,
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      setBalances(result.items);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Current stock"
        description="Warehouse inventory by product and brand"
        actions={
          <button
            onClick={load}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
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
            ) : balances.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No products found. Use Stock In to add inventory.
                </td>
              </tr>
            ) : (
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
                    {new Date(b.updatedAt).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
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
