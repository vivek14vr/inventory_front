"use client";

import { CheckStockPage } from "@/components/inventory/CheckStockPage";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AdminInventoryPage() {
  return (
    <CheckStockPage
      routes={{
        stockIn: AUTH_ROUTES.adminStockIn,
        returnPath: AUTH_ROUTES.adminReturn,
        inventoryItem: AUTH_ROUTES.adminInventoryItem,
      }}
    />
  );
}
