import { apiUrl } from "@/lib/api/base";
import type { ApiResponse } from "@/lib/api/client";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
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

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const storedRefresh = getRefreshToken();
    try {
      const response = await fetch(apiUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: storedRefresh ? JSON.stringify({ refreshToken: storedRefresh }) : "{}",
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
      return body.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function getValidAccessToken(): Promise<string | null> {
  const existing = getAccessToken();
  if (existing) return existing;
  return refreshAccessToken();
}
