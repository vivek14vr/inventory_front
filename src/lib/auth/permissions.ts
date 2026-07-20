/** Keep in sync with backend/src/shared/constants/permissions.ts */

export const Permission = {
  DASHBOARD_VIEW: "dashboard.view",
  STOCK_VIEW: "stock.view",
  STOCK_IN: "stock.in",
  STOCK_OUT: "stock.out",
  STOCK_ACTIONS: "stock.actions",
  STOCK_MOVEMENTS: "stock.movements",
  STOCK_LOW: "stock.low",
  RETURNS_CLIENT: "returns.client",
  RETURNS_WAREHOUSE: "returns.warehouse",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_DASHBOARD: "inventory.dashboard",
  TRANSFERS_VIEW: "transfers.view",
  TRANSFERS_RECEIVE: "transfers.receive",
  TRANSFERS_MANAGE: "transfers.manage",
  WAREHOUSES_VIEW: "warehouses.view",
  WAREHOUSES_MANAGE: "warehouses.manage",
  BRANDS_VIEW: "brands.view",
  BRANDS_MANAGE: "brands.manage",
  CLIENTS_VIEW: "clients.view",
  CLIENTS_MANAGE: "clients.manage",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_MANAGE: "products.manage",
  REPORTS_VIEW: "reports.view",
  /** @deprecated Prefer imports.products / imports.clients / imports.sales */
  IMPORTS_MANAGE: "imports.manage",
  IMPORTS_PRODUCTS: "imports.products",
  IMPORTS_CLIENTS: "imports.clients",
  IMPORTS_SALES: "imports.sales",
  USERS_MANAGE: "users.manage",
  AUDIT_VIEW: "audit.view",
  CHECKLISTS_MANAGE: "checklists.manage",
  CHECKLISTS_COMPLETE: "checklists.complete",
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

export type PermissionGrant = {
  code: PermissionCode;
  warehouseId?: string;
};

export type PermissionNavGroup = "main" | "more";

export type PermissionModuleDefinition = {
  id: string;
  label: string;
  description: string;
  warehouseScoped: boolean;
  /** Matches sidebar: Main menu vs More. */
  navGroup?: PermissionNavGroup;
  permissions: Array<{
    code: PermissionCode;
    label: string;
    description?: string;
    example?: string;
    warehouseScoped?: boolean;
  }>;
};

const WAREHOUSE_SCOPED = new Set<PermissionCode>([
  Permission.STOCK_VIEW,
  Permission.STOCK_IN,
  Permission.STOCK_OUT,
  Permission.STOCK_ACTIONS,
  Permission.STOCK_MOVEMENTS,
  Permission.STOCK_LOW,
  Permission.RETURNS_CLIENT,
  Permission.RETURNS_WAREHOUSE,
  Permission.TRANSFERS_VIEW,
  Permission.TRANSFERS_RECEIVE,
  Permission.TRANSFERS_MANAGE,
  Permission.REPORTS_VIEW,
  Permission.IMPORTS_SALES,
]);

export const CLIENT_RETURN_PERMISSIONS: PermissionCode[] = [
  Permission.RETURNS_CLIENT,
];

export const WAREHOUSE_RETURN_PERMISSIONS: PermissionCode[] = [
  Permission.TRANSFERS_MANAGE,
];

export const STOCK_BALANCE_READ_PERMISSIONS: PermissionCode[] = [
  Permission.STOCK_VIEW,
  Permission.STOCK_IN,
  Permission.STOCK_OUT,
];

/** Keep in sync with backend ADMIN_ONLY_PERMISSIONS. */
export const ADMIN_ONLY_PERMISSIONS: readonly PermissionCode[] = [
  Permission.INVENTORY_VIEW,
  Permission.INVENTORY_ADJUST,
  Permission.INVENTORY_DASHBOARD,
  Permission.AUDIT_VIEW,
  Permission.USERS_MANAGE,
];

export function isAdminOnlyPermission(code: string): boolean {
  return (ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(code);
}

/** Keep in sync with backend MANAGE_IMPLIES_VIEW. */
export const MANAGE_IMPLIES_VIEW: Partial<
  Record<PermissionCode, PermissionCode>
> = {
  [Permission.PRODUCTS_MANAGE]: Permission.PRODUCTS_VIEW,
  [Permission.BRANDS_MANAGE]: Permission.BRANDS_VIEW,
  [Permission.CLIENTS_MANAGE]: Permission.CLIENTS_VIEW,
  [Permission.WAREHOUSES_MANAGE]: Permission.WAREHOUSES_VIEW,
};

export const VIEW_IMPLIED_BY_MANAGE: Partial<
  Record<PermissionCode, PermissionCode>
> = Object.fromEntries(
  Object.entries(MANAGE_IMPLIES_VIEW).map(([manage, view]) => [view, manage])
) as Partial<Record<PermissionCode, PermissionCode>>;

export function isWarehouseScopedPermission(code: PermissionCode): boolean {
  return WAREHOUSE_SCOPED.has(code);
}

export function decodePermissionsFromJwt(encoded: string[]): PermissionGrant[] {
  return encoded.map((entry) => {
    const colon = entry.indexOf(":");
    if (colon === -1) {
      return { code: entry as PermissionCode };
    }
    return {
      code: entry.slice(0, colon) as PermissionCode,
      warehouseId: entry.slice(colon + 1),
    };
  });
}

export function isAdminRole(role: string): boolean {
  return role === "ADMIN";
}

/** Default staff bundle for a single warehouse (matches backend seed defaults). */
export function defaultWarehouseOperatorPermissions(
  warehouseId: string
): PermissionGrant[] {
  return [
    { code: Permission.DASHBOARD_VIEW },
    { code: Permission.STOCK_VIEW, warehouseId },
    { code: Permission.STOCK_IN, warehouseId },
    { code: Permission.STOCK_OUT, warehouseId },
    { code: Permission.RETURNS_CLIENT, warehouseId },
    { code: Permission.TRANSFERS_VIEW, warehouseId },
    { code: Permission.TRANSFERS_RECEIVE, warehouseId },
    { code: Permission.CHECKLISTS_COMPLETE },
  ];
}

export function hasWarehouseScopedPermission(
  permissions: PermissionGrant[] | undefined
): boolean {
  return (permissions ?? []).some(
    (p) => isWarehouseScopedPermission(p.code) && p.warehouseId
  );
}

export function hasPermission(
  role: string,
  permissions: PermissionGrant[] | undefined,
  code: PermissionCode,
  warehouseId?: string
): boolean {
  if (isAdminRole(role)) return true;
  const grants = permissions ?? [];
  const hasLegacyImportsManage = grants.some(
    (g) => g.code === Permission.IMPORTS_MANAGE && !g.warehouseId
  );

  if (isWarehouseScopedPermission(code)) {
    if (!warehouseId) return false;
    if (
      code === Permission.IMPORTS_SALES &&
      (hasLegacyImportsManage ||
        grants.some(
          (g) =>
            g.code === Permission.IMPORTS_MANAGE &&
            g.warehouseId === warehouseId
        ))
    ) {
      return true;
    }
    return grants.some(
      (g) => g.code === code && g.warehouseId === warehouseId
    );
  }
  if (grants.some((g) => g.code === code)) return true;
  if (
    hasLegacyImportsManage &&
    (code === Permission.IMPORTS_PRODUCTS ||
      code === Permission.IMPORTS_CLIENTS)
  ) {
    return true;
  }
  const manageThatImplies = VIEW_IMPLIED_BY_MANAGE[code];
  return Boolean(
    manageThatImplies && grants.some((g) => g.code === manageThatImplies)
  );
}

/** True if the user holds the permission at any warehouse (or globally). */
export function hasPermissionSomewhere(
  role: string,
  permissions: PermissionGrant[] | undefined,
  code: PermissionCode
): boolean {
  if (isAdminRole(role)) return true;
  const grants = permissions ?? [];
  if (grants.some((g) => g.code === code)) return true;
  if (
    grants.some((g) => g.code === Permission.IMPORTS_MANAGE) &&
    (code === Permission.IMPORTS_PRODUCTS ||
      code === Permission.IMPORTS_CLIENTS ||
      code === Permission.IMPORTS_SALES)
  ) {
    return true;
  }
  const manageThatImplies = VIEW_IMPLIED_BY_MANAGE[code];
  return Boolean(
    manageThatImplies && grants.some((g) => g.code === manageThatImplies)
  );
}

export function hasAnyPermission(
  role: string,
  permissions: PermissionGrant[] | undefined,
  codes: PermissionCode[]
): boolean {
  return codes.some((code) => hasPermissionSomewhere(role, permissions, code));
}

export function hasAllPermissions(
  role: string,
  permissions: PermissionGrant[] | undefined,
  codes: PermissionCode[]
): boolean {
  return codes.every((code) => hasPermissionSomewhere(role, permissions, code));
}

export function canWarehouseReturn(
  role: string,
  permissions: PermissionGrant[] | undefined,
  warehouseId?: string
): boolean {
  if (isAdminRole(role)) return true;
  return (
    hasPermission(role, permissions, Permission.TRANSFERS_MANAGE, warehouseId) ||
    hasPermission(role, permissions, Permission.RETURNS_WAREHOUSE, warehouseId)
  );
}

/** Migrate legacy grants; Manage → ensure View. */
export function migratePermissionGrants(
  grants: PermissionGrant[] | undefined
): PermissionGrant[] {
  if (!grants?.length) return [];
  const seen = new Set<string>();
  const out: PermissionGrant[] = [];

  function push(code: PermissionCode, warehouseId?: string) {
    const key = warehouseId ? `${code}:${warehouseId}` : code;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      code,
      ...(warehouseId ? { warehouseId } : {}),
    });
  }

  for (const grant of grants) {
    if (grant.code === Permission.RETURNS_WAREHOUSE) {
      push(Permission.TRANSFERS_MANAGE, grant.warehouseId);
      continue;
    }
    if (grant.code === Permission.IMPORTS_MANAGE) {
      push(Permission.IMPORTS_PRODUCTS);
      push(Permission.IMPORTS_CLIENTS);
      if (grant.warehouseId) {
        push(Permission.IMPORTS_SALES, grant.warehouseId);
      }
      continue;
    }
    push(grant.code, grant.warehouseId);
  }
  for (const grant of [...out]) {
    const impliedView = MANAGE_IMPLIES_VIEW[grant.code];
    if (!impliedView || grant.warehouseId) continue;
    push(impliedView);
  }
  return out;
}

/** First navigable path for a permission-based user */
export function getDefaultAppPath(
  role: string,
  permissions?: PermissionGrant[]
): string {
  if (isAdminRole(role)) return "/admin";

  const checks: Array<{ codes: PermissionCode[]; path: string }> = [
    { codes: [Permission.DASHBOARD_VIEW], path: "/app" },
    { codes: [Permission.INVENTORY_DASHBOARD], path: "/app" },
    {
      codes: [Permission.STOCK_IN, Permission.STOCK_OUT, Permission.STOCK_VIEW],
      path: "/app/stock",
    },
    {
      codes: [
        Permission.STOCK_VIEW,
        Permission.STOCK_MOVEMENTS,
        Permission.STOCK_LOW,
        Permission.INVENTORY_VIEW,
      ],
      path: "/app/inventory",
    },
    { codes: [Permission.RETURNS_CLIENT], path: "/app/return" },
    { codes: [Permission.TRANSFERS_VIEW, Permission.TRANSFERS_RECEIVE], path: "/app/transfer" },
    { codes: [Permission.TRANSFERS_MANAGE], path: "/app/transfers" },
    { codes: [Permission.REPORTS_VIEW], path: "/app/reports" },
    { codes: [Permission.IMPORTS_MANAGE], path: "/app/imports" },
    {
      codes: [
        Permission.IMPORTS_PRODUCTS,
        Permission.IMPORTS_CLIENTS,
        Permission.IMPORTS_SALES,
      ],
      path: "/app/imports",
    },
    { codes: [Permission.WAREHOUSES_MANAGE, Permission.WAREHOUSES_VIEW], path: "/app/warehouses" },
    { codes: [Permission.BRANDS_MANAGE, Permission.BRANDS_VIEW], path: "/app/brands" },
    { codes: [Permission.CLIENTS_MANAGE, Permission.CLIENTS_VIEW], path: "/app/clients" },
    { codes: [Permission.PRODUCTS_MANAGE, Permission.PRODUCTS_VIEW], path: "/app/products" },
    { codes: [Permission.USERS_MANAGE], path: "/app/users" },
    { codes: [Permission.AUDIT_VIEW], path: "/app/audit" },
    { codes: [Permission.CHECKLISTS_COMPLETE], path: "/app/checklists" },
    { codes: [Permission.CHECKLISTS_MANAGE], path: "/app/checklists" },
  ];

  for (const { codes, path } of checks) {
    if (hasAnyPermission(role, permissions, codes)) return path;
  }

  return "/app";
}

/** Route prefix → permissions required to access (strict module codes). */
export const APP_ROUTE_PERMISSIONS: Array<{
  prefix: string;
  permissions: PermissionCode[];
  requireAll?: boolean;
}> = [
  { prefix: "/app", permissions: [Permission.DASHBOARD_VIEW, Permission.INVENTORY_DASHBOARD] },
  {
    prefix: "/app/stock-in",
    permissions: [Permission.STOCK_IN],
  },
  {
    prefix: "/app/stock-out",
    permissions: [Permission.STOCK_OUT],
  },
  {
    prefix: "/app/transfer",
    permissions: [Permission.TRANSFERS_VIEW, Permission.TRANSFERS_RECEIVE],
  },
  {
    prefix: "/app/return",
    permissions: [Permission.RETURNS_CLIENT],
  },
  {
    prefix: "/app/wrong-invoice",
    permissions: [Permission.INVENTORY_VIEW, Permission.INVENTORY_ADJUST],
    requireAll: true,
  },
  {
    prefix: "/app/stock",
    permissions: [Permission.STOCK_IN, Permission.STOCK_OUT, Permission.STOCK_VIEW],
  },
  {
    prefix: "/app/inventory",
    permissions: [
      Permission.STOCK_VIEW,
      Permission.STOCK_MOVEMENTS,
      Permission.STOCK_LOW,
      Permission.INVENTORY_VIEW,
    ],
  },
  {
    prefix: "/app/transfers",
    permissions: [Permission.TRANSFERS_MANAGE],
  },
  {
    prefix: "/app/notifications",
    permissions: [Permission.CHECKLISTS_COMPLETE, Permission.CHECKLISTS_MANAGE],
  },
  { prefix: "/app/reports", permissions: [Permission.REPORTS_VIEW] },
  {
    prefix: "/app/imports",
    permissions: [
      Permission.IMPORTS_PRODUCTS,
      Permission.IMPORTS_CLIENTS,
      Permission.IMPORTS_SALES,
      Permission.IMPORTS_MANAGE,
    ],
  },
  {
    prefix: "/app/warehouses",
    permissions: [Permission.WAREHOUSES_VIEW, Permission.WAREHOUSES_MANAGE],
  },
  { prefix: "/app/brands", permissions: [Permission.BRANDS_VIEW, Permission.BRANDS_MANAGE] },
  { prefix: "/app/clients", permissions: [Permission.CLIENTS_VIEW, Permission.CLIENTS_MANAGE] },
  { prefix: "/app/products", permissions: [Permission.PRODUCTS_VIEW, Permission.PRODUCTS_MANAGE] },
  { prefix: "/app/users", permissions: [Permission.USERS_MANAGE] },
  { prefix: "/app/audit", permissions: [Permission.AUDIT_VIEW] },
  {
    prefix: "/app/checklists",
    permissions: [Permission.CHECKLISTS_COMPLETE, Permission.CHECKLISTS_MANAGE],
  },
];

export function canAccessAppPath(
  role: string,
  permissions: PermissionGrant[] | undefined,
  pathname: string
): boolean {
  if (isAdminRole(role)) return false;
  if (pathname === "/app" || pathname === "/app/") {
    return hasAnyPermission(role, permissions, [
      Permission.DASHBOARD_VIEW,
      Permission.INVENTORY_DASHBOARD,
    ]);
  }

  const match = APP_ROUTE_PERMISSIONS.filter((r) => r.prefix !== "/app")
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));

  if (!match) return false;
  if (match.requireAll) {
    return hasAllPermissions(role, permissions, match.permissions);
  }
  return hasAnyPermission(role, permissions, match.permissions);
}
