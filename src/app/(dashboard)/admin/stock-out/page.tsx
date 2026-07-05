"use client";

import { StockOutForm } from "@/components/stock/StockOutForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminStockOutPage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Stock out"
        description="Record a direct sale to a client. Use Transfer to move stock between warehouses."
      />
      <StockOutForm requireWarehouse mode="sell" />
    </div>
  );
}
