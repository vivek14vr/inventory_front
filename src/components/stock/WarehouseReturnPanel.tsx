"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/ui/DataTable";
import { api, ApiError } from "@/lib/api/client";
import { productDisplayName } from "@/lib/products/productDisplayName";
import { formatBaseQuantityWithStockUnit } from "@/lib/products/productUnits";
import type { PendingTransfer, TransferRecord } from "@/types/stock";

type WarehouseReturnTab = "received" | "in-transit";

type WarehouseReturnPanelProps = {
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  onBack: () => void;
};

function formatTransferDate(value?: string | Date): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(",", "");
}

function RouteCell({
  sourceCode,
  destCode,
}: {
  sourceCode: string;
  destCode: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-stone-700">
      <span>{sourceCode}</span>
      <span className="text-stone-400">→</span>
      <span>{destCode}</span>
    </span>
  );
}

export function WarehouseReturnPanel({
  defaultWarehouseId = "",
  allowedWarehouseIds,
  onBack,
}: WarehouseReturnPanelProps) {
  const [tab, setTab] = useState<WarehouseReturnTab>("received");
  const [receivedTransfers, setReceivedTransfers] = useState<TransferRecord[]>([]);
  const [inTransitTransfers, setInTransitTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState("");

  const scopeTransfers = useCallback(
    <T extends { destinationWarehouse?: { id: string } }>(items: T[]): T[] => {
      if (!allowedWarehouseIds || allowedWarehouseIds.length === 0) return items;
      return items.filter((t) =>
        t.destinationWarehouse
          ? allowedWarehouseIds.includes(t.destinationWarehouse.id)
          : false
      );
    },
    [allowedWarehouseIds]
  );

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [receivedResult, inTransitItems] = await Promise.all([
        api.transfers.history({
          status: "RECEIVED",
          page: 1,
          limit: 100,
          sortBy: "createdAt",
          sortOrder: "desc",
          ...(defaultWarehouseId
            ? { destinationWarehouseId: defaultWarehouseId }
            : {}),
        }),
        api.transfers.pending(defaultWarehouseId || undefined),
      ]);
      setReceivedTransfers(scopeTransfers(receivedResult.items));
      setInTransitTransfers(scopeTransfers(inTransitItems));
    } catch (err) {
      setReceivedTransfers([]);
      setInTransitTransfers([]);
      setError(err instanceof ApiError ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, [defaultWarehouseId, scopeTransfers]);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  async function confirmReceivedReturn(transfer: TransferRecord) {
    setReturningId(transfer.id);
    setError("");
    setSuccess("");
    try {
      await api.transfers.returnGoods(transfer.id, {
        notes: returnNotes.trim() || undefined,
      });
      setSuccess(
        `${formatBaseQuantityWithStockUnit(transfer.quantity, transfer.product)} returned from ${transfer.destinationWarehouse.code} to ${transfer.sourceWarehouse.code}`
      );
      setReturnNotes("");
      await loadTransfers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process return");
    } finally {
      setReturningId(null);
    }
  }

  async function confirmInTransitReturn(transfer: PendingTransfer) {
    setReturningId(transfer.id);
    setError("");
    setSuccess("");
    try {
      await api.transfers.returnInTransit(transfer.id, {
        notes: returnNotes.trim() || undefined,
      });
      setSuccess(
        `${formatBaseQuantityWithStockUnit(transfer.quantity, transfer.product)} sent back to ${transfer.sourceWarehouse.code}`
      );
      setReturnNotes("");
      await loadTransfers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process return");
    } finally {
      setReturningId(null);
    }
  }

  const receivedCount = receivedTransfers.length;
  const inTransitCount = inTransitTransfers.length;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-stone-200 bg-white px-5 text-base font-bold text-stone-600 transition hover:border-orange-200 hover:bg-orange-50"
      >
        ← Back
      </button>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "received"} onClick={() => setTab("received")}>
          Received ({receivedCount})
        </TabButton>
        <TabButton active={tab === "in-transit"} onClick={() => setTab("in-transit")}>
          In transit ({inTransitCount})
        </TabButton>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      <div className="rounded-2xl border-2 border-stone-200 bg-white p-5">
        <h2 className="text-lg font-bold text-stone-900">Warehouse return</h2>
        <p className="mt-1 text-sm text-stone-600">
          {tab === "received"
            ? "Return goods that were already accepted at this warehouse back to the sending warehouse."
            : "Return goods still in transit before they are accepted at the destination."}
        </p>
        <label className="mt-4 block text-sm font-semibold text-stone-700">
          Return notes (optional)
        </label>
        <input
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          className="form-input mt-2"
          placeholder="Reason for return, condition of goods, etc."
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : tab === "received" ? (
        receivedTransfers.length === 0 ? (
          <EmptyState message="No received transfers available to return." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <DataTable>
              <DataTableHead>
                <DataTableTh>Product</DataTableTh>
                <DataTableTh>Route</DataTableTh>
                <DataTableTh>Qty</DataTableTh>
                <DataTableTh>Sent</DataTableTh>
                <DataTableTh>Sent by</DataTableTh>
                <DataTableTh>Accepted</DataTableTh>
                <DataTableTh>Accepted by</DataTableTh>
                <DataTableTh align="right">Action</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {receivedTransfers.map((transfer) => (
                  <DataTableRow key={transfer.id}>
                    <DataTableTd className="min-w-[200px]">
                      <p className="font-semibold text-stone-900">
                        {productDisplayName(transfer.product)}
                      </p>
                      <p className="text-xs text-stone-500">{transfer.brand.name}</p>
                    </DataTableTd>
                    <DataTableTd>
                      <RouteCell
                        sourceCode={transfer.sourceWarehouse.code}
                        destCode={transfer.destinationWarehouse.code}
                      />
                    </DataTableTd>
                    <DataTableTd>
                      <StockQuantityDisplay
                        quantity={transfer.quantity}
                        stockUnit={transfer.product.stockUnit}
                        unitsPerStockUnit={transfer.product.unitsPerStockUnit}
                        baseUnit={transfer.product.baseUnit}
                        size="sm"
                      />
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap text-stone-600">
                      {formatTransferDate(transfer.createdAt)}
                    </DataTableTd>
                    <DataTableTd className="text-stone-700">
                      {transfer.createdBy?.name ?? "—"}
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap text-stone-600">
                      {formatTransferDate(transfer.receivedAt)}
                    </DataTableTd>
                    <DataTableTd className="text-stone-700">
                      {transfer.receivedBy?.name ?? "—"}
                    </DataTableTd>
                    <DataTableTd align="right">
                      <Button
                        type="button"
                        size="sm"
                        loading={returningId === transfer.id}
                        disabled={returningId !== null && returningId !== transfer.id}
                        onClick={() => void confirmReceivedReturn(transfer)}
                      >
                        Return to source
                      </Button>
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )
      ) : inTransitTransfers.length === 0 ? (
        <EmptyState message="No in-transit transfers to return." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <DataTable>
            <DataTableHead>
              <DataTableTh>Product</DataTableTh>
              <DataTableTh>Route</DataTableTh>
              <DataTableTh>Qty</DataTableTh>
              <DataTableTh>Sent</DataTableTh>
              <DataTableTh>Sent by</DataTableTh>
              <DataTableTh>Status</DataTableTh>
              <DataTableTh align="right">Action</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {inTransitTransfers.map((transfer) => (
                <DataTableRow key={transfer.id}>
                  <DataTableTd className="min-w-[200px]">
                    <p className="font-semibold text-stone-900">
                      {productDisplayName(transfer.product)}
                    </p>
                    <p className="text-xs text-stone-500">{transfer.brand.name}</p>
                  </DataTableTd>
                  <DataTableTd>
                    <RouteCell
                      sourceCode={transfer.sourceWarehouse.code}
                      destCode={transfer.destinationWarehouse?.code ?? "—"}
                    />
                  </DataTableTd>
                  <DataTableTd>
                    <StockQuantityDisplay
                      quantity={transfer.quantity}
                      stockUnit={transfer.product.stockUnit}
                      unitsPerStockUnit={transfer.product.unitsPerStockUnit}
                      baseUnit={transfer.product.baseUnit}
                      size="sm"
                    />
                  </DataTableTd>
                  <DataTableTd className="whitespace-nowrap text-stone-600">
                    {formatTransferDate(transfer.createdAt)}
                  </DataTableTd>
                  <DataTableTd className="text-stone-700">
                    {transfer.createdBy?.name ?? "—"}
                  </DataTableTd>
                  <DataTableTd>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      In transit
                    </span>
                  </DataTableTd>
                  <DataTableTd align="right">
                    <Button
                      type="button"
                      size="sm"
                      loading={returningId === transfer.id}
                      disabled={returningId !== null && returningId !== transfer.id}
                      onClick={() => void confirmInTransitReturn(transfer)}
                    >
                      Return to source
                    </Button>
                  </DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-2xl px-6 py-3 text-base font-bold transition ${
        active
          ? "bg-orange-600 text-white shadow-md shadow-orange-900/20"
          : "border-2 border-stone-200 bg-white text-stone-600 hover:border-orange-200 hover:bg-orange-50"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
      {message}
    </div>
  );
}
