"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
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
import { ProductSearchBar } from "@/components/search/ProductSearchBar";
import { fetchAppProductSearchSuggestions } from "@/lib/search/productSearchSuggestions";
import type { InventoryBalance, PendingTransfer } from "@/types/stock";

const routes = {
  stockIn: AUTH_ROUTES.appStockIn,
  stockOut: AUTH_ROUTES.appStockOut,
  inventory: AUTH_ROUTES.appInventory,
  transfer: AUTH_ROUTES.appTransfer,
  transfers: AUTH_ROUTES.appTransfers,
  returns: AUTH_ROUTES.appReturn,
  reports: AUTH_ROUTES.appReports,
  products: AUTH_ROUTES.appProducts,
  invoices: AUTH_ROUTES.appInvoices,
  checklists: AUTH_ROUTES.appChecklists,
};

export default function AppDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { can, canAny, warehousesFor } = usePermissions();
  const canStockIn = can(Permission.STOCK_IN);
  const canStockOut = can(Permission.STOCK_OUT);
  const canCheckStock = canAny([
    Permission.STOCK_VIEW,
    Permission.STOCK_MOVEMENTS,
    Permission.STOCK_LOW,
    Permission.INVENTORY_VIEW,
  ]);
  const canSendStock = canAny([
    Permission.TRANSFERS_VIEW,
    Permission.TRANSFERS_RECEIVE,
  ]);
  const canTransferHistory = can(Permission.TRANSFERS_MANAGE);
  const canReturns = can(Permission.RETURNS_CLIENT);
  const canReports = can(Permission.REPORTS_VIEW);
  const canProducts = canAny([Permission.PRODUCTS_VIEW, Permission.PRODUCTS_MANAGE]);
  const canInvoices = canAny([
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_ADJUST,
  ]);
  const canImport = can(Permission.IMPORTS_MANAGE);
  const canChecklists = canAny([
    Permission.CHECKLISTS_COMPLETE,
    Permission.CHECKLISTS_MANAGE,
  ]);
  const showActionGrid =
    canStockIn ||
    canStockOut ||
    canCheckStock ||
    canSendStock ||
    canTransferHistory ||
    canReturns ||
    canReports ||
    canProducts ||
    canInvoices;

  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [checklistPending, setChecklistPending] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const warehouseId = getPrimaryWarehouseId(user);
  const showStock = canViewStockDashboard(user) || canCheckStock;
  /** Pending inbound transfers belong on Send Stock — not Stock In / Transfer List-only. */
  const showPendingTransfers = canSendStock;

  const load = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setError("");

    if (!showStock && !showPendingTransfers && !canChecklists) {
      setBalances([]);
      setPendingTransfers([]);
      setChecklistPending(0);
      setLoading(false);
      return;
    }

    const errors: string[] = [];

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
            .catch((err) => {
              setBalances([]);
              errors.push(
                err instanceof ApiError ? err.message : "Failed to load stock"
              );
            })
        );
      } else {
        setBalances([]);
      }

      if (showPendingTransfers) {
        const allowed = new Set([
          ...warehousesFor(Permission.TRANSFERS_RECEIVE),
          ...warehousesFor(Permission.TRANSFERS_VIEW),
        ]);
        const pendingWarehouseId =
          warehouseId && allowed.has(warehouseId) ? warehouseId : undefined;

        tasks.push(
          api.transfers
            .pending(pendingWarehouseId)
            .then((t) => setPendingTransfers(t))
            .catch((err) => {
              setPendingTransfers([]);
              errors.push(
                err instanceof ApiError
                  ? err.message
                  : "Failed to load pending transfers"
              );
            })
        );
      } else {
        setPendingTransfers([]);
      }

      if (canChecklists) {
        tasks.push(
          api.checklists
            .today()
            .then((items) => {
              const pending = items.reduce(
                (sum, c) => sum + Math.max(0, c.totalCount - c.completedCount),
                0
              );
              setChecklistPending(pending);
            })
            .catch(() => {
              setChecklistPending(0);
            })
        );
      } else {
        setChecklistPending(0);
      }

      await Promise.all(tasks);
      if (errors.length) setError(errors[0]!);
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
      setChecklistPending(0);
    } finally {
      setLoading(false);
    }
  }, [
    authLoading,
    showStock,
    showPendingTransfers,
    canChecklists,
    warehouseId,
    warehousesFor,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSkus = balances.filter((b) => b.quantity > 0).length;
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

      {showStock && (
        <ProductSearchBar
          inventoryPath={AUTH_ROUTES.appInventory}
          fetchSuggestions={fetchAppProductSearchSuggestions}
          className="max-w-2xl"
        />
      )}

      <Alert message={error} />

      {!authLoading && !warehouseId && (
        <Alert message="Your account has no warehouse linked. Ask an admin to assign a warehouse or stock permissions." />
      )}

      {authLoading || loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner label="Loading…" />
        </div>
      ) : !showStock &&
        !showPendingTransfers &&
        !canImport &&
        !showActionGrid &&
        !canChecklists ? (
        <EmptyState
          title="Dashboard access only"
          description="You can open other sections from the menu. Ask an admin to grant stock, transfer, or other module access."
        />
      ) : (
        <>
          {(showStock || showPendingTransfers || canChecklists) && (
          <div className="grid gap-4 sm:grid-cols-3">
            {showStock && (
              <>
                <StatCard label="Products in stock" value={totalSkus} variant="info" />
                <StatCard label="Total quantity" value={totalQty.toLocaleString()} />
              </>
            )}
            {showPendingTransfers && (
              <StatCard
                label="Pending transfers"
                value={pendingTransfers.length}
                variant={pendingTransfers.length > 0 ? "warning" : "default"}
                hint={
                  pendingTransfers.length > 0
                    ? "Open Send Stock to receive"
                    : undefined
                }
              />
            )}
            {canChecklists && (
              <StatCard
                label="Checklist tasks left"
                value={checklistPending}
                variant={checklistPending > 0 ? "warning" : "default"}
                hint={
                  checklistPending > 0
                    ? "Open Daily Checklist below"
                    : "You’re caught up for today"
                }
              />
            )}
          </div>
          )}

          {showActionGrid && (
          <section>
            <h2 className="mb-4 text-lg font-bold text-stone-800">What do you want to do?</h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {canStockIn ? (
                <QuickActionCard
                  href={routes.stockIn}
                  title="Stock In"
                  description="Add stock"
                  iconLabel="Stock In"
                  size="large"
                  color="orange"
                />
              ) : null}
              {canStockOut ? (
                <QuickActionCard
                  href={routes.stockOut}
                  title="Stock Out"
                  description="Sell to client"
                  iconLabel="Stock Out"
                  size="large"
                  color="orange"
                />
              ) : null}
              {canSendStock ? (
                <QuickActionCard
                  href={routes.transfer}
                  title="Send Stock"
                  description="Transfer to another warehouse"
                  iconLabel="Send Stock"
                  size="large"
                  color="amber"
                  badge={
                    pendingTransfers.length > 0
                      ? String(pendingTransfers.length)
                      : undefined
                  }
                />
              ) : null}
              {canCheckStock ? (
                <QuickActionCard
                  href={routes.inventory}
                  title="Check Stock"
                  description="See your stock"
                  iconLabel="Check Stock"
                  size="large"
                  color="sky"
                />
              ) : null}
              {canReports ? (
                <QuickActionCard
                  href={routes.reports}
                  title="Download Reports"
                  description="Export stock & sales"
                  iconLabel="Reports"
                  size="large"
                  color="teal"
                />
              ) : null}
              {canTransferHistory ? (
                <QuickActionCard
                  href={routes.transfers}
                  title="Transfer List"
                  description="View all transfers"
                  iconLabel="Transfer List"
                  size="large"
                  color="violet"
                />
              ) : null}
              {canProducts ? (
                <QuickActionCard
                  href={routes.products}
                  title="Products"
                  description="Add or edit products"
                  iconLabel="Products"
                  size="large"
                  color="rose"
                />
              ) : null}
              {canReturns ? (
                <QuickActionCard
                  href={routes.returns}
                  title="Return"
                  description="Client invoice returns"
                  iconLabel="Return"
                  size="large"
                  color="emerald"
                />
              ) : null}
              {canInvoices ? (
                <QuickActionCard
                  href={routes.invoices}
                  title="Invoices"
                  description="Fix client & invoice numbers"
                  iconLabel="Invoices"
                  size="large"
                  color="indigo"
                />
              ) : null}
            </div>
          </section>
          )}

          {canChecklists && (
            <section>
              <h2 className="mb-4 text-lg font-bold text-stone-800">
                Daily checklist
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-4xl">
                <QuickActionCard
                  href={routes.checklists}
                  title="Open today’s checklist"
                  description={
                    checklistPending > 0
                      ? `${checklistPending} task${checklistPending === 1 ? "" : "s"} still open`
                      : "Review and complete assigned tasks"
                  }
                  iconLabel="Daily Checklists"
                  size="large"
                  color="emerald"
                  badge={
                    checklistPending > 0 ? String(checklistPending) : undefined
                  }
                />
              </div>
            </section>
          )}

          {canImport && (
            <section>
              <h2 className="mb-4 text-lg font-bold text-stone-800">Import from Excel</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-4xl">
                <QuickActionCard
                  href={`${AUTH_ROUTES.appImports}?mode=products`}
                  title="Import products"
                  description="Upload product catalog spreadsheet"
                  iconLabel="Imports"
                  size="large"
                  color="teal"
                />
                <QuickActionCard
                  href={`${AUTH_ROUTES.appImports}?mode=clients`}
                  title="Import clients"
                  description="Upload client list spreadsheet"
                  iconLabel="Import Clients"
                  size="large"
                  color="sky"
                />
                <QuickActionCard
                  href={`${AUTH_ROUTES.appImports}?mode=sales`}
                  title="Import sales"
                  description="Direct sell from Tally register"
                  iconLabel="Import Sales"
                  size="large"
                  color="violet"
                />
              </div>
            </section>
          )}

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
              action={
                canStockIn ? (
                  <ButtonLink href={routes.stockIn}>Stock in</ButtonLink>
                ) : undefined
              }
            />
          )}
        </>
      )}
    </div>
  );
}
