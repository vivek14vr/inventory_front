"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasAnyPermission,
  hasPermission,
  hasPermissionSomewhere,
  isAdminRole,
  isWarehouseScopedPermission,
  type PermissionCode,
  type PermissionGrant,
} from "@/lib/auth/permissions";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const role = user?.role ?? "";
    const permissions = user?.permissions;

    /**
     * Without a warehouseId: "do you have this capability anywhere?"
     * (needed for page gates — scoped grants must not fail closed with no site).
     * With warehouseId: require that exact warehouse grant (fail closed).
     */
    function can(code: PermissionCode, warehouseId?: string): boolean {
      if (warehouseId) {
        return hasPermission(role, permissions, code, warehouseId);
      }
      if (isWarehouseScopedPermission(code)) {
        return hasPermissionSomewhere(role, permissions, code);
      }
      return hasPermission(role, permissions, code);
    }

    function canAny(codes: PermissionCode[]): boolean {
      return hasAnyPermission(role, permissions, codes);
    }

    function warehousesFor(code: PermissionCode): string[] {
      if (isAdminRole(role)) return [];
      return [
        ...new Set(
          (permissions ?? [])
            .filter((g) => g.code === code && g.warehouseId)
            .map((g) => g.warehouseId!)
        ),
      ];
    }

    function defaultWarehouseId(): string {
      if (user?.warehouseId) return user.warehouseId;
      if (user?.warehouse?.id) return user.warehouse.id;
      const fromStock = warehousesFor("stock.in" as PermissionCode);
      if (fromStock.length) return fromStock[0];
      const fromOut = warehousesFor("stock.out" as PermissionCode);
      if (fromOut.length) return fromOut[0];
      const fromView = warehousesFor("stock.view" as PermissionCode);
      return fromView[0] ?? "";
    }

    function needsWarehousePicker(code: PermissionCode): boolean {
      if (isAdminRole(role)) return true;
      return warehousesFor(code).length > 1;
    }

    return {
      user,
      isAdmin: isAdminRole(role),
      can,
      canAny,
      warehousesFor,
      defaultWarehouseId,
      needsWarehousePicker,
      permissions: permissions as PermissionGrant[] | undefined,
    };
  }, [user]);
}
