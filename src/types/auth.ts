import type { PermissionGrant } from "@/lib/auth/permissions";

export type UserRole = "ADMIN" | "WAREHOUSE_USER";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  warehouseId?: string;
  warehouse?: { id: string; name: string; code: string };
  permissions?: PermissionGrant[];
  isActive: boolean;
};

export type LoginResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  /** @deprecated Refresh is httpOnly cookie only — may be absent. */
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  user: AuthUser;
  /** @deprecated Use accessToken */
  token: string;
};

export type PublicUser = AuthUser & {
  createdAt?: string;
  updatedAt?: string;
};
