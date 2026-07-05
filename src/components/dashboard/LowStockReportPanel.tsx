import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import { lowStockSourceLabel } from "@/lib/inventory/lowStock";
import { formatBaseQuantityWithStockUnit } from "@/lib/products/productUnits";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import type { AdminDashboard } from "@/types/inventory";

type LowStockReportPanelProps = {
  items: AdminDashboard["lowStockItems"];
  totalCount: number;
  totalItems?: AdminDashboard["lowStockTotals"];
  totalLowCount?: number;
};

export function LowStockReportPanel({
  items,
  totalCount,
  totalItems = [],
  totalLowCount = 0,
}: LowStockReportPanelProps) {
  return (
    <Panel
      title="Low stock report"
      description="By warehouse and combined totals across locations"
      action={
        <Link
          href={AUTH_ROUTES.adminInventory}
          className="text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          View inventory
        </Link>
      }
    >
      {items.length === 0 && totalItems.length === 0 ? (
        <EmptyState
          title="All stock levels healthy"
          description="No items are at or below their warehouse or total thresholds."
        />
      ) : (
        <div className="space-y-4">
          {items.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                By warehouse ({totalCount})
              </p>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                {items.map((item) => (
                  <li
                    key={`${item.warehouseId}-${item.productId}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">
                        {item.productName}
                        <span className="font-normal text-zinc-500"> · {item.brandName}</span>
                      </p>
                      {item.secondaryProductName?.trim() ? (
                        <p className="text-xs text-zinc-500">
                          Secondary: {item.secondaryProductName}
                        </p>
                      ) : null}
                      <p className="text-xs text-zinc-500">
                        {item.warehouseName}{" "}
                        <span className="font-mono">({item.warehouseCode})</span>
                        {item.lowStockThreshold != null ? (
                          <span className="ml-2 text-amber-700">
                            threshold ≤{" "}
                            {formatBaseQuantityWithStockUnit(item.lowStockThreshold, item)}
                            <span className="text-amber-600/80">
                              {" "}
                              (
                              {lowStockSourceLabel(item) === "warehouse"
                                ? "warehouse"
                                : "default"}
                              )
                            </span>
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-amber-900">
                      <StockQuantityDisplay
                        quantity={item.quantity}
                        stockUnit={item.stockUnit}
                        unitsPerStockUnit={item.unitsPerStockUnit}
                        baseUnit={item.baseUnit}
                        size="sm"
                        align="right"
                        className="[&_span:first-child]:!font-semibold"
                      />
                    </span>
                  </li>
                ))}
              </ul>
              {totalCount > items.length ? (
                <p className="text-xs text-zinc-500">
                  Showing top {items.length} of {totalCount} warehouse low-stock rows.
                </p>
              ) : null}
            </div>
          ) : null}

          {totalItems.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Total across warehouses ({totalLowCount})
              </p>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-orange-100 bg-orange-50/30">
                {totalItems.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">
                        {item.productName}
                        <span className="font-normal text-zinc-500"> · {item.brandName}</span>
                      </p>
                      <p className="text-xs text-orange-800">
                        total threshold ≤{" "}
                        {formatBaseQuantityWithStockUnit(
                          item.totalLowStockThreshold,
                          item
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-orange-900">
                      <StockQuantityDisplay
                        quantity={item.totalQuantity}
                        stockUnit={item.stockUnit}
                        unitsPerStockUnit={item.unitsPerStockUnit}
                        baseUnit={item.baseUnit}
                        size="sm"
                        align="right"
                        className="[&_span:first-child]:!font-semibold"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
