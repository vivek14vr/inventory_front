"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Alert } from "@/components/ui/Alert";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { api, ApiError } from "@/lib/api/client";
import { LowStockReportPanel } from "@/components/dashboard/LowStockReportPanel";
import { TransferActivityPanel } from "@/components/dashboard/TransferActivityPanel";
import type { AdminDashboard } from "@/types/inventory";

function StatIcons() {
  return {
    units: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    skus: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9.75h15" />
      </svg>
    ),
    transfers: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    alert: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  };
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const icons = StatIcons();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setError("");
    try {
      setData(await api.inventory.dashboard());
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load dashboard";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello, ${user?.name?.split(" ")[0] ?? "Admin"}!`}
        description="Tap a button below to get started."
        actions={
          <Button variant="secondary" size="lg" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Alert message={error} />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading…" />
        </div>
      ) : data ? (
        <>
          {/* Main action tiles — PetPooja-style large buttons */}
          <section>
            <h2 className="mb-4 text-lg font-bold text-stone-800">
              What do you want to do?
            </h2>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <QuickActionCard
                href={AUTH_ROUTES.adminStockIn}
                title="Stock In"
                description="Add stock to a warehouse"
                iconLabel="Stock In"
                size="large"
                color="orange"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminStockOut}
                title="Stock Out"
                description="Sell to a client"
                iconLabel="Stock Out"
                size="large"
                color="orange"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminTransfer}
                title="Send Stock"
                description="Transfer to another warehouse"
                iconLabel="Transfer"
                size="large"
                color="amber"
                badge={data.pendingTransfers > 0 ? String(data.pendingTransfers) : undefined}
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminInventory}
                title="Check Stock"
                description="See what you have"
                iconLabel="Check Stock"
                size="large"
                color="sky"
                badge={data.lowStockCount > 0 ? `${data.lowStockCount} low` : undefined}
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminReports}
                title="Download Reports"
                description="Export stock & sales"
                iconLabel="Reports"
                size="large"
                color="teal"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminTransfers}
                title="Transfer List"
                description="View all transfers"
                iconLabel="Transfer List"
                size="large"
                color="violet"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminProducts}
                title="Products"
                description="Add or edit products"
                iconLabel="Products"
                size="large"
                color="rose"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminReturn}
                title="Return"
                description="From client or warehouse"
                iconLabel="Return"
                size="large"
                color="emerald"
              />
              <QuickActionCard
                href={AUTH_ROUTES.adminInvoices}
                title="Invoices"
                description="Fix client & invoice numbers"
                iconLabel="Invoices"
                size="large"
                color="indigo"
              />
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total quantity"
              value={data.totalInventoryUnits.toLocaleString()}
              icon={icons.units}
            />
            <StatCard
              label="SKUs in stock"
              value={data.totalSkus.toLocaleString()}
              icon={icons.skus}
              variant="info"
            />
            <StatCard
              label="Pending transfers"
              value={data.pendingTransfers}
              variant={data.pendingTransfers > 0 ? "warning" : "default"}
              icon={icons.transfers}
              hint={data.pendingTransfers > 0 ? "Awaiting receive" : undefined}
            />
            <StatCard
              label="Low stock (warehouse)"
              value={data.lowStockCount}
              variant={data.lowStockCount > 0 ? "warning" : "default"}
              icon={icons.alert}
              hint={
                data.lowStockCount > 0
                  ? "At or below per-warehouse thresholds"
                  : undefined
              }
            />
            <StatCard
              label="Low stock (total)"
              value={data.lowStockTotalCount ?? 0}
              variant={data.lowStockTotalCount > 0 ? "warning" : "default"}
              icon={icons.alert}
              hint={
                data.lowStockTotalCount > 0
                  ? "Combined qty below sum of thresholds"
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <LowStockReportPanel
              items={data.lowStockItems}
              totalCount={data.lowStockCount}
              totalItems={data.lowStockTotals ?? []}
              totalLowCount={data.lowStockTotalCount ?? 0}
            />
            <TransferActivityPanel items={data.transferActivity} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Warehouse summary"
              description="Stock totals by location"
              action={
                <Link
                  href={AUTH_ROUTES.adminInventory}
                  className="text-sm font-semibold text-orange-700 hover:text-orange-800"
                >
                  View all
                </Link>
              }
            >
              {data.warehouseSummaries.length === 0 ? (
                <EmptyState
                  title="No stock recorded"
                  description="Add stock via Stock In or create products first."
                  action={
                    <ButtonLink href={AUTH_ROUTES.adminStockIn} variant="primary">
                      Stock in
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {data.warehouseSummaries.map((w) => (
                    <li
                      key={w.warehouseId}
                      className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">{w.name}</p>
                        <p className="text-xs text-zinc-500">{w.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-zinc-900">
                          {w.totalUnits.toLocaleString()} units
                        </p>
                        <p className="text-xs text-zinc-500">{w.skuCount} SKUs</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent sales" description="Direct selling (stock out)">
              {data.recentSales.length === 0 ? (
                <EmptyState
                  title="No direct sales yet"
                  description="Record sales via Stock Out (direct selling) from any warehouse."
                />
              ) : (
                <ul className="space-y-3">
                  {data.recentSales.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-zinc-100 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-zinc-900">
                          {s.product}{" "}
                          <span className="font-normal text-zinc-500">× {s.quantity}</span>
                        </p>
                        <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                          {s.warehouse}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {s.clientName} · Invoice {s.invoiceNumber}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="Recent stock movements"
            description="Latest activity across all warehouses"
            noPadding
          >
            {data.recentMovements.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No movements yet" description="Stock in and out activity will appear here." />
              </div>
            ) : (
              <DataTable>
                <DataTableHead>
                  <DataTableTh>Date</DataTableTh>
                  <DataTableTh>Type</DataTableTh>
                  <DataTableTh>Product</DataTableTh>
                  <DataTableTh>Warehouse</DataTableTh>
                  <DataTableTh align="right">Qty</DataTableTh>
                </DataTableHead>
                <DataTableBody>
                  {data.recentMovements.map((m) => (
                    <DataTableRow key={m.id}>
                      <DataTableTd className="whitespace-nowrap text-zinc-500">
                        {new Date(m.createdAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </DataTableTd>
                      <DataTableTd>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            m.type === "STOCK_IN"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {m.type === "STOCK_IN" ? "Stock In" : "Stock Out"}
                        </span>
                      </DataTableTd>
                      <DataTableTd>
                        <span className="font-medium text-zinc-900">{m.product?.name}</span>
                        <span className="text-zinc-500"> · {m.brand?.name}</span>
                      </DataTableTd>
                      <DataTableTd>{m.warehouse?.code}</DataTableTd>
                      <DataTableTd align="right" className="font-semibold tabular-nums text-zinc-900">
                        {m.quantity}
                      </DataTableTd>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
