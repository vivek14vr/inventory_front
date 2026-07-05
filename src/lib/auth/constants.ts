/** Short-lived JWT for API + Next.js middleware */
export const ACCESS_TOKEN_COOKIE = "inventory_access";
export const ACCESS_TOKEN_STORAGE_KEY = "inventory_access";

/** Rotating refresh token (sessionStorage; httpOnly cookie also set when same-site) */
export const REFRESH_TOKEN_STORAGE_KEY = "inventory_refresh";

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
  adminReceive: "/admin/receive",
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
  appReceive: "/app/receive",
  appTransfers: "/app/transfers",
  appReports: "/app/reports",
  appImports: "/app/imports",
  appWarehouses: "/app/warehouses",
  appBrands: "/app/brands",
  appProducts: "/app/products",
  appUsers: "/app/users",
  appAudit: "/app/audit",
  appChecklists: "/app/checklists",
  appNotifications: "/app/notifications",
} as const;
