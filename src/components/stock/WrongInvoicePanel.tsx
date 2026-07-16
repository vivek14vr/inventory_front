"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterFields";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api/client";
import { hasPermission, isAdminRole, Permission } from "@/lib/auth/permissions";
import { fetchInvoiceSearchSuggestions } from "@/lib/search/productSearchSuggestions";
import type { PaginationMeta } from "@/types/pagination";
import type { Warehouse } from "@/types/master";
import type { InvoiceGroup, InvoiceGroupLine } from "@/types/stock";
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import {
  thresholdBaseToDisplay,
  thresholdDisplayToBase,
  usesStockUnit,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { validateNonNegativeInteger } from "@/lib/validation/quantity";
import {
  InvoiceGroupedTable,
  type InvoiceSortField,
} from "@/components/stock/InvoiceGroupedTable";

function toLineDraft(line: InvoiceGroupLine, mode: QuantityEntryMode) {
  return { quantity: thresholdBaseToDisplay(line.quantity, mode, line) };
}

export function WrongInvoicePanel() {
  const { user } = useAuth();
  const canAdjust = useMemo(
    () =>
      isAdminRole(user?.role ?? "") ||
      hasPermission(user?.role ?? "", user?.permissions, Permission.INVENTORY_ADJUST),
    [user]
  );
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterError, setFilterError] = useState("");
  const [groups, setGroups] = useState<InvoiceGroup[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string }>>({});
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [savingLinesGroupId, setSavingLinesGroupId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<InvoiceSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const quantityModeRef = useRef<QuantityEntryMode>(quantityMode);
  useEffect(() => {
    quantityModeRef.current = quantityMode;
  }, [quantityMode]);

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  useEffect(() => {
    setFilterError("");
    api.warehouses
      .list(true)
      .then((warehouseList) => {
        setWarehouses(warehouseList);
      })
      .catch((err) => {
        setFilterError(
          err instanceof ApiError
            ? err.message
            : "Could not load warehouses for filters"
        );
      });
  }, []);

  const quantityToggleProduct = useMemo(() => {
    for (const group of groups) {
      const match = group.lines.find((line) => usesStockUnit(line));
      if (match) return match;
    }
    return groups[0]?.lines[0] ?? null;
  }, [groups]);

  const syncLineDrafts = useCallback(
    (nextGroups: InvoiceGroup[], mode: QuantityEntryMode) => {
      setLineDrafts(
        Object.fromEntries(
          nextGroups.flatMap((group) =>
            group.lines.map((line) => [line.movementId, toLineDraft(line, mode)])
          )
        )
      );
    },
    []
  );

  const load = useCallback(
    async (
      term: string,
      warehouseFilter: string,
      pageNum: number,
      pageLimit: number,
      sortField: InvoiceSortField,
      order: "asc" | "desc"
    ) => {
      setLoading(true);
      setError("");
      try {
        const result = await api.inventory.listInvoiceGroups({
          ...(term.trim() ? { search: term.trim() } : {}),
          ...(warehouseFilter ? { warehouseId: warehouseFilter } : {}),
          page: pageNum,
          limit: pageLimit,
          sortBy: sortField,
          sortOrder: order,
        });
        setGroups(result.items);
        setPagination(result.pagination);
        syncLineDrafts(result.items, quantityModeRef.current);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load invoices");
        setGroups([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    },
    [syncLineDrafts]
  );

  useEffect(() => {
    void load(query, warehouseId, page, limit, sortBy, sortOrder);
  }, [load, query, warehouseId, page, limit, sortBy, sortOrder]);

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

  function handleFilterChange(setter: (value: string) => void, value: string) {
    setter(value);
    resetPage();
  }

  function handleClearFilters() {
    setWarehouseId("");
    resetPage();
  }

  const hasActiveFilters = Boolean(warehouseId);

  const emptyMessage = useMemo(() => {
    if (query) return `No records found for "${query}"`;
    if (warehouseId) return "No invoice records match the selected filters";
    return "No invoice records yet";
  }, [query, warehouseId]);

  function handleSort(field: InvoiceSortField) {
    if (sortBy === field) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" || field === "modificationCount" ? "desc" : "asc");
    }
    resetPage();
  }

  function updateLineDraft(movementId: string, quantity: string) {
    setLineDrafts((prev) => ({
      ...prev,
      [movementId]: { quantity },
    }));
  }

  function handleQuantityModeChange(nextMode: QuantityEntryMode) {
    setLineDrafts((prev) => {
      const next: Record<string, { quantity: string }> = { ...prev };
      for (const group of groups) {
        for (const line of group.lines) {
          const draft = prev[line.movementId];
          const base =
            draft != null
              ? thresholdDisplayToBase(draft.quantity, quantityMode, line)
              : line.quantity;
          const resolvedBase = base ?? line.quantity;
          next[line.movementId] = {
            quantity: thresholdBaseToDisplay(resolvedBase, nextMode, line),
          };
        }
      }
      return next;
    });
    setQuantityMode(nextMode);
  }

  async function saveGroupQuantities(group: InvoiceGroup) {
    const parsedLines = group.lines
      .filter((line) => line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING")
      .map((line) => {
        const draft = lineDrafts[line.movementId] ?? toLineDraft(line, quantityMode);
        const parsedQty = thresholdDisplayToBase(draft.quantity, quantityMode, line);
        return { line, parsedQty };
      });

    const invalid = parsedLines.find(
      ({ parsedQty }) => parsedQty == null || validateNonNegativeInteger(parsedQty as number)
    );
    if (invalid) {
      setError(
        invalid.parsedQty == null
          ? "Each quantity must be a valid number"
          : validateNonNegativeInteger(invalid.parsedQty as number) ??
              "Each quantity must be 0 or greater"
      );
      return;
    }

    const changed = parsedLines.filter(
      ({ line, parsedQty }) => parsedQty !== line.quantity
    );
    if (changed.length === 0) {
      setSuccess("No quantity changes to save");
      return;
    }

    setSavingLinesGroupId(group.id);
    setError("");
    setSuccess("");
    try {
      const anchorLine =
        group.lines.find((line) => line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING") ??
        group.lines[0];
      if (!anchorLine) return;

      await api.inventory.updateMovementInvoice(anchorLine.movementId, {
        lineUpdates: changed.map(({ line, parsedQty }) => ({
          movementId: line.movementId,
          quantity: parsedQty as number,
        })),
      });
      setSuccess(`Updated quantities for ${changed.length} product line(s)`);
      await load(query, warehouseId, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save quantities");
    } finally {
      setSavingLinesGroupId(null);
    }
  }

  async function deleteLine(_group: InvoiceGroup, line: InvoiceGroupLine) {
    if (!window.confirm(`Delete sale line for ${line.productName}? Stock will be restored.`)) {
      return;
    }

    setDeletingId(line.movementId);
    setError("");
    setSuccess("");
    try {
      await api.inventory.deleteInvoice(line.movementId);
      setSuccess(`Deleted ${line.productName} from invoice`);
      await load(query, warehouseId, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete line");
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
          Sales and returns are grouped by voucher number. Edit product quantities only; client
          name and voucher number are read-only. Each product line shows how many times its
          quantity has been updated.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <SearchInputWithSuggestions
              value={search}
              onChange={setSearch}
              onSelect={(suggestion) => {
                setSearch(suggestion.searchTerm);
                setQuery(suggestion.searchTerm);
                resetPage();
              }}
              fetchSuggestions={fetchInvoiceSearchSuggestions}
              placeholder="Search invoice, client, or product…"
              ariaLabel="Search invoice records"
              inputClassName="form-input w-full !pl-11"
              emptyMessage={(term) => `No records match “${term}”`}
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

        <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4">
          <FilterSelect
            label="Warehouse"
            value={warehouseId}
            onChange={(value) => handleFilterChange(setWarehouseId, value)}
            options={[
              { value: "", label: "All warehouses" },
              ...warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: `${warehouse.name} (${warehouse.code})`,
              })),
            ]}
          />
          {hasActiveFilters ? (
            <div className="flex items-end">
              <Button type="button" variant="secondary" size="sm" onClick={handleClearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
          {groups.length > 0 ? (
            <div className="flex min-w-[12rem] flex-col gap-1 sm:ml-auto">
              <span className="text-xs font-medium text-zinc-500">Quantities in</span>
              <ThresholdUnitToggle
                mode={quantityMode}
                onModeChange={handleQuantityModeChange}
                product={quantityToggleProduct}
                size="sm"
                alwaysShow
                fallbackStockUnitLabel="Boxes"
                fallbackBaseUnitLabel="Units"
              />
            </div>
          ) : null}
        </div>
      </form>

      <Alert message={filterError} />
      <Alert message={error} />
      <Alert message={success} type="success" />

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          <InvoiceGroupedTable
            groups={groups}
            canAdjust={canAdjust}
            quantityMode={quantityMode}
            lineDrafts={lineDrafts}
            savingLinesGroupId={savingLinesGroupId}
            deletingId={deletingId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onLineDraftChange={updateLineDraft}
            onSaveGroupQuantities={saveGroupQuantities}
            onDeleteLine={deleteLine}
          />

          {pagination && (
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onLimitChange={(nextLimit) => {
                setLimit(nextLimit);
                resetPage();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
