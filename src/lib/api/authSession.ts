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

let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
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
    return body.data.accessToken;
  } catch {
    return null;
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request("inventory-auth-refresh", performRefresh);
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function getValidAccessToken(): Promise<string | null> {
  const valid = getAccessTokenIfValid();
  if (valid) return valid;
  return refreshAccessToken();
}
