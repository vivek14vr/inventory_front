"use client";

import { Suspense } from "react";
import { StockOperationsPanel } from "@/components/stock/StockOperationsPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { AUTH_ROUTES } from "@/lib/auth/constants";

function AdminStockContent() {
  return (
    <StockOperationsPanel
      requireWarehouse
      productsHref={AUTH_ROUTES.adminProducts}
    />
  );
}

export default function AdminStockPage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Stock In / Stock Out"
        description="Tap to select warehouse, brand, and product step by step."
      />

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        }
      >
        <AdminStockContent />
      </Suspense>
    </div>
  );
}
