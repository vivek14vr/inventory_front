/** Short-lived JWT for API + Next.js middleware */
export const ACCESS_TOKEN_COOKIE = "inventory_access";
export const ACCESS_TOKEN_STORAGE_KEY = "inventory_access";

/** Rotating refresh token (localStorage + httpOnly cookie when same-site) */
export const REFRESH_TOKEN_COOKIE = "inventory_refresh";
export const REFRESH_TOKEN_STORAGE_KEY = "inventory_refresh";

/** Cookie lifetime for the access JWT cookie — must outlive JWT so middleware can
 *  still see an expired token and let the client refresh (default matches refresh TTL). */
export const ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** @deprecated Use ACCESS_TOKEN_COOKIE */
export const TOKEN_COOKIE = ACCESS_TOKEN_COOKIE;
/** @deprecated Use ACCESS_TOKEN_STORAGE_KEY */
export const TOKEN_STORAGE_KEY = ACCESS_TOKEN_STORAGE_KEY;

export const AUTH_ROUTES = {
  login: "/login",
  adminDashboard: "/admin",
  adminUsers: "/admin/users",
  adminWarehouses: "/admin/warehouses",
  adminBrands: "/admin/brands",
  adminClients: "/admin/clients",
  adminProducts: "/admin/products",
  adminTransfers: "/admin/transfers",
  adminInventory: "/admin/inventory",
  adminInventoryItem: (warehouseId: string, productId: string) =>
    `/admin/inventory/${warehouseId}/${productId}`,
  adminStock: "/admin/stock",
  adminStockIn: "/admin/stock-in",
  adminStockOut: "/admin/stock-out",
  adminTransfer: "/admin/transfer",
  adminReturn: "/admin/return",
  adminWrongInvoice: "/admin/wrong-invoice",
  adminInvoices: "/admin/wrong-invoice",
  adminReceive: "/admin/transfer",
  adminImports: "/admin/imports",
  adminReports: "/admin/reports",
  adminAudit: "/admin/audit",
  adminChecklists: "/admin/checklists",
  adminNotifications: "/admin/notifications",
  appDashboard: "/app",
  appStock: "/app/stock",
  appStockIn: "/app/stock-in",
  appStockOut: "/app/stock-out",
  appTransfer: "/app/transfer",
  appReturn: "/app/return",
  appWrongInvoice: "/app/wrong-invoice",
  appInvoices: "/app/wrong-invoice",
  appInventory: "/app/inventory",
  appReceive: "/app/transfer",
  appTransfers: "/app/transfers",
  appReports: "/app/reports",
  appImports: "/app/imports",
  appWarehouses: "/app/warehouses",
  appBrands: "/app/brands",
  appClients: "/app/clients",
  appProducts: "/app/products",
  appUsers: "/app/users",
  appAudit: "/app/audit",
  appChecklists: "/app/checklists",
  appNotifications: "/app/notifications",
} as const;
