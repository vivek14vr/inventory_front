"use client";

import Link from "next/link";
import { StockInForm } from "@/components/stock/StockInForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AdminStockInPage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Stock in"
          description="Add one or more products from a brand into a warehouse."
        />
        <Link
          href={AUTH_ROUTES.adminProducts}
          className="text-base font-semibold text-orange-700 hover:text-orange-800"
        >
          + New product
        </Link>
      </div>
      <StockInForm requireWarehouse />
    </div>
  );
}
