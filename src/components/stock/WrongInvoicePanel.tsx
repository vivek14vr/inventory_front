"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { api, ApiError } from "@/lib/api/client";
import { fetchInvoiceSearchSuggestions } from "@/lib/search/productSearchSuggestions";
import type { PaginationMeta } from "@/types/pagination";
import type { InvoiceGroup, InvoiceGroupLine } from "@/types/stock";
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import {
  InvoiceGroupedTable,
  type InvoiceSortField,
} from "@/components/stock/InvoiceGroupedTable";

function toGroupDraft(group: InvoiceGroup) {
  return {
    invoiceNumber: group.invoiceNumber,
    clientName: group.clientName,
  };
}

function toLineDraft(line: InvoiceGroupLine) {
  return { quantity: String(line.quantity) };
}

export function WrongInvoicePanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<InvoiceGroup[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [groupDrafts, setGroupDrafts] = useState<
    Record<string, { invoiceNumber: string; clientName: string }>
  >({});
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string }>>({});
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savingLinesGroupId, setSavingLinesGroupId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastWorkedMovementId, setLastWorkedMovementId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<InvoiceSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const syncDrafts = useCallback((nextGroups: InvoiceGroup[]) => {
    setGroupDrafts(
      Object.fromEntries(nextGroups.map((group) => [group.id, toGroupDraft(group)]))
    );
    setLineDrafts(
      Object.fromEntries(
        nextGroups.flatMap((group) =>
          group.lines.map((line) => [line.movementId, toLineDraft(line)])
        )
      )
    );
  }, []);

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
        const result = await api.inventory.listInvoiceGroups({
          ...(term.trim() ? { search: term.trim() } : {}),
          page: pageNum,
          limit: pageLimit,
          sortBy: sortField,
          sortOrder: order,
        });
        setGroups(result.items);
        setPagination(result.pagination);
        syncDrafts(result.items);

        const lastWorked = await api.inventory.listInvoiceGroups({
          page: 1,
          limit: 1,
          sortBy: "invoiceLastWorkedAt",
          sortOrder: "desc",
        });
        const lastWorkedGroup = lastWorked.items[0];
        setLastWorkedMovementId(lastWorkedGroup?.lastWorkedMovementId ?? null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load invoices");
        setGroups([]);
        setPagination(null);
        setLastWorkedMovementId(null);
      } finally {
        setLoading(false);
      }
    },
    [syncDrafts]
  );

  useEffect(() => {
    void load(query, page, limit, sortBy, sortOrder);
  }, [load, query, page, limit, sortBy, sortOrder]);

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

  function handleSort(field: InvoiceSortField) {
    if (sortBy === field) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" || field === "invoiceLastWorkedAt" ? "desc" : "asc");
    }
    resetPage();
  }

  function updateGroupDraft(
    groupId: string,
    patch: Partial<{ invoiceNumber: string; clientName: string }>
  ) {
    setGroupDrafts((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], ...patch },
    }));
  }

  function updateLineDraft(movementId: string, quantity: string) {
    setLineDrafts((prev) => ({
      ...prev,
      [movementId]: { quantity },
    }));
  }

  async function saveGroup(group: InvoiceGroup) {
    const draft = groupDrafts[group.id] ?? toGroupDraft(group);
    const nextInvoice = draft.invoiceNumber.trim();
    const nextClient = draft.clientName.trim();
    if (nextInvoice === group.invoiceNumber.trim() && nextClient === group.clientName.trim()) {
      setSuccess("No invoice changes to save");
      return;
    }

    setSavingGroupId(group.id);
    setError("");
    setSuccess("");
    try {
      await Promise.all(
        group.lines.map((line) =>
          api.inventory.updateMovementInvoice(line.movementId, {
            invoiceNumber: nextInvoice,
            clientName: nextClient,
          })
        )
      );
      setSuccess(`Updated invoice ${nextInvoice || "record"} for ${group.lines.length} line(s)`);
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save invoice changes");
    } finally {
      setSavingGroupId(null);
    }
  }

  async function saveGroupQuantities(group: InvoiceGroup) {
    const parsedLines = group.lines
      .filter((line) => line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING")
      .map((line) => {
        const draft = lineDrafts[line.movementId] ?? toLineDraft(line);
        const parsedQty = Number.parseInt(draft.quantity, 10);
        return { line, parsedQty };
      });

    const invalid = parsedLines.find(
      ({ parsedQty }) => !Number.isFinite(parsedQty) || parsedQty < 0
    );
    if (invalid) {
      setError("Each quantity must be a whole number of 0 or greater");
      return;
    }

    const changed = parsedLines.filter(({ line, parsedQty }) => parsedQty !== line.quantity);
    if (changed.length === 0) {
      setSuccess("No quantity changes to save");
      return;
    }

    setSavingLinesGroupId(group.id);
    setError("");
    setSuccess("");
    try {
      await Promise.all(
        changed.map(({ line, parsedQty }) =>
          api.inventory.updateMovementInvoice(line.movementId, {
            quantity: parsedQty,
          })
        )
      );
      setSuccess(`Updated quantities for ${changed.length} product line(s)`);
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save quantities");
    } finally {
      setSavingLinesGroupId(null);
    }
  }

  async function toggleLastWorked(group: InvoiceGroup) {
    const movementId = group.lastWorkedMovementId ?? group.lines[0]?.movementId;
    if (!movementId) return;

    const currentlyFlagged = group.lastWorkedMovementId === lastWorkedMovementId;
    setFlaggingId(movementId);
    setError("");
    setSuccess("");
    try {
      await api.inventory.updateMovementInvoice(movementId, {
        markLastWorked: !currentlyFlagged,
      });
      setSuccess(currentlyFlagged ? "Removed last worked flag" : "Marked as last worked");
      await load(query, page, limit, sortBy, sortOrder);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update last worked flag");
    } finally {
      setFlaggingId(null);
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
      await load(query, page, limit, sortBy, sortOrder);
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
          Sales and returns are grouped by voucher number. Each invoice is one row with all
          products listed in Particulars, client and voucher details on the same header line,
          and matching quantities per product (0 is allowed).
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
      </form>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
          {query ? `No records found for "${query}"` : "No invoice records yet"}
        </div>
      ) : (
        <div className="space-y-4">
          <InvoiceGroupedTable
            groups={groups}
            lastWorkedMovementId={lastWorkedMovementId}
            groupDrafts={groupDrafts}
            lineDrafts={lineDrafts}
            savingGroupId={savingGroupId}
            savingLinesGroupId={savingLinesGroupId}
            flaggingId={flaggingId}
            deletingId={deletingId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onGroupDraftChange={updateGroupDraft}
            onLineDraftChange={updateLineDraft}
            onSaveGroup={saveGroup}
            onSaveGroupQuantities={saveGroupQuantities}
            onToggleLastWorked={toggleLastWorked}
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
