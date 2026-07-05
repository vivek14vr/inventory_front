"use client";

import { useCallback, useEffect, useState } from "react";
import { StockInForm } from "@/components/stock/StockInForm";
import { StockOutForm } from "@/components/stock/StockOutForm";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api, ApiError } from "@/lib/api/client";
import { productDisplayName } from "@/lib/products/productDisplayName";
import type { Warehouse } from "@/types/master";
import type { PendingTransfer } from "@/types/stock";

type TransferTab = "send" | "receive";

type TransferPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  /** Allow filtering the pending list by destination warehouse. */
  showDestinationFilter?: boolean;
};

export function TransferPanel({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  showDestinationFilter = false,
}: TransferPanelProps) {
  const [tab, setTab] = useState<TransferTab>("send");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<PendingTransfer | null>(null);
  const [sendSuccess, setSendSuccess] = useState("");

  const load = useCallback(
    async (whId = filterWarehouseId) => {
      setLoading(true);
      setError("");
      try {
        setTransfers(await api.transfers.pending(whId || undefined));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load transfers");
      } finally {
        setLoading(false);
      }
    },
    [filterWarehouseId]
  );

  function openReceiveTab() {
    setTab("receive");
    void load();
  }

  useEffect(() => {
    if (!showDestinationFilter) return;
    api.warehouses
      .list()
      .then(setWarehouses)
      .catch((err) => {
        setWarehouses([]);
        setError(err instanceof ApiError ? err.message : "Could not load warehouses");
      });
  }, [showDestinationFilter]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <TabButton active={tab === "send"} onClick={() => setTab("send")}>
          Send transfer
        </TabButton>
        <TabButton active={tab === "receive"} onClick={openReceiveTab}>
          Receive incoming
        </TabButton>
      </div>

      {tab === "send" ? (
        <div className="space-y-4">
          <Alert message={sendSuccess} type="success" />
          <StockOutForm
            requireWarehouse={requireWarehouse}
            defaultWarehouseId={defaultWarehouseId}
            allowedWarehouseIds={allowedWarehouseIds}
            mode="transfer"
            onSuccess={(message) => {
              setSendSuccess(message);
              openReceiveTab();
            }}
          />
        </div>
      ) : (
        <>
          {showDestinationFilter && (
            <div className="rounded-2xl border-2 border-stone-200 bg-white p-5">
              <ButtonSelect
                label="Filter by destination"
                value={filterWarehouseId}
                onChange={(v) => {
                  setFilterWarehouseId(v);
                  void load(v);
                }}
                size="sm"
                options={[
                  { value: "", label: "All" },
                  ...warehouses
                    .filter((w) => w.isActive)
                    .map((w) => ({ value: w.id, label: w.name, sublabel: w.code })),
                ]}
              />
              <p className="mt-2 text-xs text-stone-500">
                Showing all pending transfers unless a destination is selected.
              </p>
            </div>
          )}

          <Alert message={error} />

          {receiving ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setReceiving(null)}
              >
                ← Back to list
              </Button>
              <StockInForm
                requireWarehouse={requireWarehouse}
                transfer={receiving}
                onSuccess={() => {
                  setReceiving(null);
                  load();
                }}
              />
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : transfers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center text-base font-medium text-stone-500">
              No pending transfers to receive.
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
                      <span className="font-mono text-xs font-semibold text-stone-800">
                        {t.sourceWarehouse.code}
                      </span>
                      <span>→</span>
                      <span className="font-mono text-xs font-semibold text-stone-800">
                        {t.destinationWarehouse?.code ?? "?"}
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
                    {t.destinationWarehouse && (
                      <p className="mt-0.5 text-xs text-stone-500">
                        Receive at {t.destinationWarehouse.name}
                      </p>
                    )}
                  </div>
                  <Button type="button" size="sm" onClick={() => setReceiving(t)}>
                    Receive stock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
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
  children: React.ReactNode;
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
