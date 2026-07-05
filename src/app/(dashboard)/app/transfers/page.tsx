"use client";

import { useCallback, useEffect, useState } from "react";
import { StockInForm } from "@/components/stock/StockInForm";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, ApiError } from "@/lib/api/client";
import { productDisplayName } from "@/lib/products/productDisplayName";
import type { PendingTransfer } from "@/types/stock";

export default function AppTransfersPage() {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState<PendingTransfer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTransfers(await api.transfers.pending());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Incoming transfers"
        description="Receive stock sent from other warehouses"
      />

      <Alert message={error} />

      {receiving ? (
        <div className="space-y-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setReceiving(null)}>
            ← Back to list
          </Button>
          <StockInForm
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
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
          No pending transfers
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm"
            >
              <div>
                <p className="font-medium text-zinc-900">
                  {productDisplayName(t.product)} · {t.brand.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-zinc-600">
                  <span>
                    From {t.sourceWarehouse.name} ({t.sourceWarehouse.code}) · Qty
                  </span>
                  <StockQuantityDisplay
                    quantity={t.quantity}
                    stockUnit={t.product.stockUnit}
                    unitsPerStockUnit={t.product.unitsPerStockUnit}
                    baseUnit={t.product.baseUnit}
                    size="sm"
                  />
                </div>
              </div>
              <Button type="button" size="sm" onClick={() => setReceiving(t)}>
                Receive stock
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
