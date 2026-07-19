import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  hasAllPermissions,
  hasAnyPermission,
  Permission,
  type PermissionGrant,
} from "@/lib/auth/permissions";

export type NavGroup = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

export function buildAppNavGroups(
  role: string,
  permissions?: PermissionGrant[]
): NavGroup[] {
  const mainMenu: NavGroup["items"] = [];
  const moreMenu: NavGroup["items"] = [];

  if (
    hasAnyPermission(role, permissions, [
      Permission.DASHBOARD_VIEW,
      Permission.INVENTORY_DASHBOARD,
    ])
  ) {
    mainMenu.push({ href: AUTH_ROUTES.appDashboard, label: "Home" });
  }
  if (hasAnyPermission(role, permissions, [Permission.STOCK_IN])) {
    mainMenu.push({ href: AUTH_ROUTES.appStockIn, label: "Stock In" });
  }
  if (hasAnyPermission(role, permissions, [Permission.STOCK_OUT])) {
    mainMenu.push({ href: AUTH_ROUTES.appStockOut, label: "Stock Out" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.STOCK_OUT,
      Permission.TRANSFERS_RECEIVE,
      Permission.TRANSFERS_VIEW,
      Permission.TRANSFERS_MANAGE,
    ])
  ) {
    mainMenu.push({ href: AUTH_ROUTES.appTransfer, label: "Send Stock" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.RETURNS_CLIENT,
      Permission.RETURNS_WAREHOUSE,
    ])
  ) {
    mainMenu.push({ href: AUTH_ROUTES.appReturn, label: "Return" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.STOCK_VIEW,
      Permission.INVENTORY_VIEW,
    ])
  ) {
    mainMenu.push({ href: AUTH_ROUTES.appInventory, label: "Check Stock" });
  }
  if (
    hasAllPermissions(role, permissions, [
      Permission.INVENTORY_VIEW,
      Permission.INVENTORY_ADJUST,
    ])
  ) {
    mainMenu.push({ href: AUTH_ROUTES.appInvoices, label: "Invoices" });
  }
  if (hasAnyPermission(role, permissions, [Permission.REPORTS_VIEW])) {
    mainMenu.push({ href: AUTH_ROUTES.appReports, label: "Reports" });
  }

  if (
    hasAnyPermission(role, permissions, [
      Permission.TRANSFERS_VIEW,
      Permission.TRANSFERS_RECEIVE,
      Permission.TRANSFERS_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appTransfers, label: "Transfer History" });
  }
  if (hasAnyPermission(role, permissions, [Permission.IMPORTS_MANAGE])) {
    moreMenu.push({ href: AUTH_ROUTES.appImports, label: "Imports" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.WAREHOUSES_VIEW,
      Permission.WAREHOUSES_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appWarehouses, label: "Warehouses" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.BRANDS_VIEW,
      Permission.BRANDS_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appBrands, label: "Brands" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.CLIENTS_VIEW,
      Permission.CLIENTS_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appClients, label: "Clients" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.PRODUCTS_VIEW,
      Permission.PRODUCTS_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appProducts, label: "Products" });
  }
  if (hasAnyPermission(role, permissions, [Permission.USERS_MANAGE])) {
    moreMenu.push({ href: AUTH_ROUTES.appUsers, label: "Users" });
  }
  if (hasAnyPermission(role, permissions, [Permission.AUDIT_VIEW])) {
    moreMenu.push({ href: AUTH_ROUTES.appAudit, label: "Activity Log" });
  }
  if (
    hasAnyPermission(role, permissions, [
      Permission.CHECKLISTS_COMPLETE,
      Permission.CHECKLISTS_MANAGE,
    ])
  ) {
    moreMenu.push({ href: AUTH_ROUTES.appChecklists, label: "Daily Tasks" });
  }

  const groups: NavGroup[] = [];
  if (mainMenu.length) {
    groups.push({ title: "Main menu", items: mainMenu });
  }
  if (moreMenu.length) {
    groups.push({ title: "More", items: moreMenu });
  }
  return groups;
}
