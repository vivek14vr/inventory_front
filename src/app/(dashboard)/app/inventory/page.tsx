"use client";

import { CheckStockPage } from "@/components/inventory/CheckStockPage";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AppInventoryPage() {
  return (
    <CheckStockPage
      routes={{
        stockIn: AUTH_ROUTES.appStockIn,
        returnPath: AUTH_ROUTES.appReturn,
        inventoryItem: AUTH_ROUTES.appInventoryItem,
      }}
    />
  );
}
