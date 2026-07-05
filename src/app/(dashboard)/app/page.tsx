"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  canViewPendingTransfers,
  canViewStockDashboard,
  getPrimaryWarehouseId,
  getWarehouseLabel,
} from "@/lib/auth/warehouseContext";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type { InventoryBalance, PendingTransfer } from "@/types/stock";

const routes = {
  stockIn: AUTH_ROUTES.appStockIn,
  stockOut: AUTH_ROUTES.appStockOut,
  inventory: AUTH_ROUTES.appInventory,
  transfer: AUTH_ROUTES.appTransfer,
  returns: AUTH_ROUTES.appReturn,
};

export default function AppDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const warehouseId = getPrimaryWarehouseId(user);
  const showStock = canViewStockDashboard(user);
  const showTransfers = canViewPendingTransfers(user);
  const showReturns = showStock || showTransfers;

  const load = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setError("");

    if (!showStock && !showTransfers) {
      setBalances([]);
      setPendingTransfers([]);
      setLoading(false);
      return;
    }

    try {
      const tasks: Promise<void>[] = [];

      if (showStock) {
        tasks.push(
          api.stock
            .balances({
              page: 1,
              limit: 100,
              ...(warehouseId ? { warehouseId } : {}),
            })
            .then((b) => setBalances(b.items))
        );
      } else {
        setBalances([]);
      }

      if (showTransfers) {
        tasks.push(
          api.transfers
            .pending(warehouseId)
            .then((t) => setPendingTransfers(t))
        );
      } else {
        setPendingTransfers([]);
      }

      await Promise.all(tasks);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load data";
      setError(message);
      setBalances([]);
      setPendingTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, showStock, showTransfers, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSkus = balances.length;
  const totalQty = balances.reduce((s, b) => s + b.quantity, 0);
  const warehouseLabel = getWarehouseLabel(user, authLoading);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello, ${user?.name?.split(" ")[0] ?? "there"}!`}
        description={warehouseLabel}
        actions={
          <Button variant="secondary" size="lg" onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Alert message={error} />

      {!authLoading && !warehouseId && (
        <Alert message="Your account has no warehouse linked. Ask an admin to assign a warehouse or stock permissions." />
      )}

      {authLoading || loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Loading…" />
        </div>
      ) : !showStock && !showTransfers ? (
        <EmptyState
          title="Dashboard access only"
          description="You can open other sections from the menu. Stock and transfer stats need stock or transfer permissions."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {showStock && (
              <>
                <StatCard label="Products in stock" value={totalSkus} variant="info" />
                <StatCard label="Total quantity" value={totalQty.toLocaleString()} />
              </>
            )}
            {showTransfers && (
              <StatCard
                label="Pending transfers"
                value={pendingTransfers.length}
                variant={pendingTransfers.length > 0 ? "warning" : "default"}
                hint={
                  pendingTransfers.length > 0
                    ? "Ready to receive via Stock In"
                    : undefined
                }
              />
            )}
          </div>

          <section>
            <h2 className="mb-4 text-lg font-bold text-stone-800">What do you want to do?</h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
              {showStock && (
                <>
                  <QuickActionCard
                    href={routes.stockIn}
                    title="Stock In"
                    description="Add stock"
                    iconLabel="Stock In"
                    size="large"
                    color="orange"
                  />
                  <QuickActionCard
                    href={routes.stockOut}
                    title="Stock Out"
                    description="Sell to client"
                    iconLabel="Stock Out"
                    size="large"
                    color="orange"
                  />
                  <QuickActionCard
                    href={routes.inventory}
                    title="Check Stock"
                    description="See your stock"
                    iconLabel="Check Stock"
                    size="large"
                    color="sky"
                  />
                </>
              )}
              {showTransfers && (
                <QuickActionCard
                  href={routes.transfer}
                  title="Transfer"
                  description="Send or receive stock"
                  iconLabel="Transfer"
                  size="large"
                  color="amber"
                  badge={
                    pendingTransfers.length > 0
                      ? String(pendingTransfers.length)
                      : undefined
                  }
                />
              )}
              {showReturns && (
                <QuickActionCard
                  href={routes.returns}
                  title="Return"
                  description="From client or warehouse"
                  iconLabel="Return"
                  size="large"
                  color="emerald"
                />
              )}
            </div>
          </section>

          {showStock && balances.length > 0 && (
            <Panel title="Top stock" description="Highest quantities on hand">
              <ul className="space-y-2">
                {[...balances]
                  .sort((a, b) => b.quantity - a.quantity)
                  .slice(0, 5)
                  .map((b) => (
                    <li
                      key={`${b.productId}-${b.brandId}`}
                      className="flex justify-between rounded-lg border border-zinc-100 px-4 py-2.5 text-sm"
                    >
                      <span className="text-zinc-700">
                        {b.productName}
                        {b.secondaryProductName?.trim() ? (
                          <span className="block text-xs text-zinc-500">
                            {b.secondaryProductName}
                          </span>
                        ) : null}
                        <span className="text-zinc-400"> · {b.brandName}</span>
                      </span>
                      <StockQuantityDisplay
                        quantity={b.quantity}
                        stockUnit={b.stockUnit}
                        unitsPerStockUnit={b.unitsPerStockUnit}
                        baseUnit={b.baseUnit}
                        size="sm"
                        align="right"
                      />
                    </li>
                  ))}
              </ul>
            </Panel>
          )}

          {showStock && balances.length === 0 && !error && warehouseId && (
            <EmptyState
              title="No inventory yet"
              description="Record your first Stock In to start tracking balances."
              action={<ButtonLink href={routes.stockIn}>Stock in</ButtonLink>}
            />
          )}
        </>
      )}
    </div>
  );
}
