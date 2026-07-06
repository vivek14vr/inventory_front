"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReturnPanel } from "@/components/stock/ReturnPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AUTH_ROUTES } from "@/lib/auth/constants";

function AdminReturnPageContent() {
  const searchParams = useSearchParams();
  const warehouseId = searchParams.get("warehouseId") ?? "";
  const backHref = warehouseId ? AUTH_ROUTES.adminInventory : AUTH_ROUTES.adminDashboard;

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Return"
        description="Record goods returned from a client by updating sold quantities on an invoice."
      />
      <ReturnPanel
        requireWarehouse
        defaultWarehouseId={warehouseId}
        backHref={backHref}
      />
    </div>
  );
}

export default function AdminReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading return…" />
        </div>
      }
    >
      <AdminReturnPageContent />
    </Suspense>
  );
}
