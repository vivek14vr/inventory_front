"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasAnyPermission,
  hasPermission,
  isAdminRole,
  type PermissionCode,
  type PermissionGrant,
} from "@/lib/auth/permissions";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(() => {
    const role = user?.role ?? "";
    const permissions = user?.permissions;

    function can(code: PermissionCode, warehouseId?: string): boolean {
      return hasPermission(role, permissions, code, warehouseId);
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
      const fromStock = warehousesFor("stock.in" as PermissionCode);
      if (fromStock.length) return fromStock[0];
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
