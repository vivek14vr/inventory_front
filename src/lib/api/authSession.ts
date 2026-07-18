import { apiUrl } from "@/lib/api/base";
import type { ApiResponse } from "@/lib/api/client";
import {
  clearAuthTokens,
  getAccessTokenIfValid,
  getRefreshToken,
  setAuthTokens,
  syncAccessTokenCookie,
} from "@/lib/auth/token";
import type { AuthUser } from "@/types/auth";

export type TokenRefreshResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  token: string;
  user: AuthUser;
};

export type RefreshSessionResult = {
  accessToken: string;
  user: AuthUser;
};

let refreshInFlight: Promise<RefreshSessionResult | null> | null = null;

async function performRefresh(): Promise<RefreshSessionResult | null> {
  const storedRefresh = getRefreshToken();
  try {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: storedRefresh
        ? JSON.stringify({ refreshToken: storedRefresh })
        : "{}",
    });

    const body = (await response.json()) as ApiResponse<TokenRefreshResponse>;
    if (!response.ok || !body.success || !body.data) {
      if (response.status === 401 || response.status === 403) {
        clearAuthTokens();
      }
      return null;
    }

    setAuthTokens({
      accessToken: body.data.accessToken,
      accessTokenExpiresIn: body.data.accessTokenExpiresIn,
      refreshToken: body.data.refreshToken,
      refreshTokenExpiresIn: body.data.refreshTokenExpiresIn,
    });
    syncAccessTokenCookie();
    return {
      accessToken: body.data.accessToken,
      user: body.data.user,
    };
  } catch {
    return null;
  }
}

/** Full refresh including the latest user/permissions from the server. */
export async function refreshSession(): Promise<RefreshSessionResult | null> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request("inventory-auth-refresh", performRefresh);
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** @returns access token only — prefer refreshSession when you need updated user. */
export async function refreshAccessToken(): Promise<string | null> {
  const result = await refreshSession();
  return result?.accessToken ?? null;
}

export async function getValidAccessToken(): Promise<string | null> {
  const valid = getAccessTokenIfValid();
  if (valid) return valid;
  return refreshAccessToken();
}
