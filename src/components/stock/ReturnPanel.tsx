"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StockInForm } from "@/components/stock/StockInForm";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api, ApiError } from "@/lib/api/client";
import { productDisplayName } from "@/lib/products/productDisplayName";
import { formatBaseQuantityWithStockUnit } from "@/lib/products/productUnits";
import type { PendingTransfer, TransferRecord } from "@/types/stock";

type ReturnSource = "choose" | "client" | "warehouse-transfer" | "warehouse-manual";

type ReturnPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
};

export function ReturnPanel({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
}: ReturnPanelProps) {
  const [source, setSource] = useState<ReturnSource>("choose");
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<PendingTransfer[]>([]);
  const [pendingIncomingError, setPendingIncomingError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState("");

  const loadReceivedTransfers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.transfers.history({
        status: "RECEIVED",
        page: 1,
        limit: 50,
        ...(defaultWarehouseId
          ? { destinationWarehouseId: defaultWarehouseId }
          : {}),
      });
      // Only transfers received at a warehouse this user can act on are returnable.
      const items =
        allowedWarehouseIds && allowedWarehouseIds.length > 0
          ? result.items.filter((t) =>
              allowedWarehouseIds.includes(t.destinationWarehouse.id)
            )
          : result.items;
      setTransfers(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, [defaultWarehouseId, allowedWarehouseIds]);

  const loadPendingIncoming = useCallback(async () => {
    setPendingIncomingError("");
    try {
      const items = await api.transfers.pending(defaultWarehouseId || undefined);
      const scoped =
        allowedWarehouseIds && allowedWarehouseIds.length > 0
          ? items.filter((t) =>
              t.destinationWarehouse
                ? allowedWarehouseIds.includes(t.destinationWarehouse.id)
                : false
            )
          : items;
      setPendingIncoming(scoped);
    } catch (err) {
      setPendingIncoming([]);
      setPendingIncomingError(
        err instanceof ApiError
          ? err.message
          : "Could not check pending incoming transfers"
      );
    }
  }, [defaultWarehouseId, allowedWarehouseIds]);

  useEffect(() => {
    if (source === "warehouse-transfer") {
      void loadReceivedTransfers();
    }
    if (source === "warehouse-transfer" || source === "warehouse-manual") {
      void loadPendingIncoming();
    }
  }, [source, loadReceivedTransfers, loadPendingIncoming]);

  async function confirmTransferReturn(transfer: TransferRecord) {
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
      await loadReceivedTransfers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to process return");
    } finally {
      setReturningId(null);
    }
  }

  function goBack() {
    setError("");
    setPendingIncomingError("");
    setSource("choose");
  }

  if (source === "choose") {
    return (
      <div className="space-y-5">
        <Alert message={success} type="success" />
        <SelectionGrid
          title="Return from where?"
          subtitle="Client returns add stock back to your warehouse. Warehouse returns send goods back to the sending warehouse."
          items={[
            {
              id: "client",
              title: "From client",
              subtitle: "Customer returning sold goods",
            },
            {
              id: "warehouse",
              title: "From warehouse",
              subtitle: "Transfer return or manual receipt",
            },
          ]}
          onSelect={(id) => {
            setSuccess("");
            if (id === "client") setSource("client");
            else setSource("warehouse-transfer");
          }}
        />
      </div>
    );
  }

  if (source === "client") {
    return (
      <div className="space-y-5">
        <Alert message={success} type="success" />
        <StockInForm
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId}
          allowedWarehouseIds={allowedWarehouseIds}
          returnMode="client"
          onSuccess={(message) => {
            setSuccess(message);
            goBack();
          }}
          onBack={goBack}
        />
      </div>
    );
  }

  if (source === "warehouse-manual") {
    return (
      <div className="space-y-5">
        <Alert message={success} type="success" />
        {pendingIncomingError ? (
          <Alert
            message={`Could not check pending incoming transfers: ${pendingIncomingError}`}
            type="error"
          />
        ) : null}
        {pendingIncoming.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <p className="text-base font-bold text-amber-900">
              {pendingIncoming.length} pending incoming transfer
              {pendingIncoming.length === 1 ? "" : "s"} found
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Manual return adds stock without linking to a transfer. If these goods
              came from a transfer, use <strong>Return transfer</strong> or receive the
              transfer instead — a manual return on top of receiving the same goods will
              double-count stock.
            </p>
            <ul className="mt-3 space-y-1.5">
              {pendingIncoming.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-1.5 text-sm text-amber-900"
                >
                  <span className="font-semibold">{productDisplayName(t.product)}</span>
                  <span>· {t.brand.name} ·</span>
                  <span className="font-mono text-xs font-semibold">
                    {t.sourceWarehouse.code}
                  </span>
                  <span>→</span>
                  <span className="font-mono text-xs font-semibold">
                    {t.destinationWarehouse?.code ?? "—"}
                  </span>
                  <span>·</span>
                  <StockQuantityDisplay
                    quantity={t.quantity}
                    stockUnit={t.product.stockUnit}
                    unitsPerStockUnit={t.product.unitsPerStockUnit}
                    baseUnit={t.product.baseUnit}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setSource("warehouse-transfer")}
            >
              Go to Return transfer
            </Button>
          </div>
        )}
        <StockInForm
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId}
          allowedWarehouseIds={allowedWarehouseIds}
          returnMode="warehouse"
          onSuccess={(message) => {
            setSuccess(message);
            goBack();
          }}
          onBack={goBack}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={goBack}
        className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-stone-200 bg-white px-5 text-base font-bold text-stone-600 transition hover:border-orange-200 hover:bg-orange-50"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path
            fillRule="evenodd"
            d="M11.78 4.22a.75.75 0 010 1.06L7.56 9.5h8.19a.75.75 0 010 1.5H7.56l4.22 4.22a.75.75 0 11-1.06 1.06l-5.5-5.5a.75.75 0 010-1.06l5.5-5.5a.75.75 0 011.06 0z"
            clipRule="evenodd"
          />
        </svg>
        Back
      </button>

      <div className="flex flex-wrap gap-2">
        <TabButton active onClick={() => setSource("warehouse-transfer")}>
          Return transfer
        </TabButton>
        <TabButton active={false} onClick={() => setSource("warehouse-manual")}>
          Manual return
        </TabButton>
      </div>

      <Alert message={error} />
      {pendingIncomingError ? (
        <Alert
          message={`Could not check pending incoming transfers: ${pendingIncomingError}`}
          type="error"
        />
      ) : null}
      <Alert message={success} type="success" />

      <>
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5">
            <label className="block text-base font-semibold text-stone-700">
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
          ) : transfers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
              No received transfers available to return. Use manual return if goods came back
              without a transfer record.
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-stone-200 bg-white p-5"
                >
                  <div>
                    <p className="font-bold text-stone-900">
                      {productDisplayName(t.product)} · {t.brand.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-stone-600">
                      <span className="font-mono text-xs font-semibold">
                        {t.sourceWarehouse.code}
                      </span>
                      <span>→</span>
                      <span className="font-mono text-xs font-semibold">
                        {t.destinationWarehouse.code}
                      </span>
                      <span>· Qty</span>
                      <StockQuantityDisplay
                        quantity={t.quantity}
                        stockUnit={t.product.stockUnit}
                        unitsPerStockUnit={t.product.unitsPerStockUnit}
                        baseUnit={t.product.baseUnit}
                        size="sm"
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Return sends stock back to {t.sourceWarehouse.name}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    loading={returningId === t.id}
                    disabled={returningId !== null && returningId !== t.id}
                    onClick={() => void confirmTransferReturn(t)}
                  >
                    Return to source
                  </Button>
                </div>
              ))}
            </div>
          )}
      </>
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
