"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StockInForm } from "@/components/stock/StockInForm";
import { StockOutForm } from "@/components/stock/StockOutForm";

export type StockOperationTab = "in" | "out";

type StockOperationsPanelProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  canStockIn?: boolean;
  canStockOut?: boolean;
  productsHref?: string;
  defaultTab?: StockOperationTab;
};

export function StockOperationsPanel({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  canStockIn = true,
  canStockOut = true,
  productsHref,
  defaultTab = "in",
}: StockOperationsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: StockOperationTab =
    tabParam === "out" ? "out" : tabParam === "in" ? "in" : defaultTab;
  const tab: StockOperationTab =
    initialTab === "in" && !canStockIn && canStockOut
      ? "out"
      : initialTab === "out" && !canStockOut && canStockIn
        ? "in"
        : initialTab;

  function setTab(next: StockOperationTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-2">
        <div className="flex gap-2">
          {canStockIn && (
            <TabButton active={tab === "in"} onClick={() => setTab("in")}>
              Stock in
            </TabButton>
          )}
          {canStockOut && (
            <TabButton active={tab === "out"} onClick={() => setTab("out")}>
              Stock out
            </TabButton>
          )}
        </div>
        {productsHref && tab === "in" && (
          <Link
            href={productsHref}
            className="text-base font-semibold text-orange-700 hover:text-orange-800"
          >
            + New product
          </Link>
        )}
      </div>

      {tab === "in" ? (
        <StockInForm
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId}
          allowedWarehouseIds={allowedWarehouseIds}
        />
      ) : (
        <StockOutForm
          requireWarehouse={requireWarehouse}
          defaultWarehouseId={defaultWarehouseId}
          allowedWarehouseIds={allowedWarehouseIds}
        />
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
      className={`rounded-2xl px-6 py-4 text-base font-bold transition min-h-14 ${
        active
          ? "bg-orange-600 text-white shadow-md shadow-orange-900/20"
          : "border-2 border-stone-200 bg-white text-stone-600 hover:border-orange-200 hover:bg-orange-50"
      }`}
    >
      {children}
    </button>
  );
}
