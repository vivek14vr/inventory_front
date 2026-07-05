import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
} from "./constants";
import { getDefaultAppPath } from "./permissions";
import type { PermissionGrant } from "./permissions";

export type AuthTokenPair = {
  accessToken: string;
  accessTokenExpiresIn?: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
};

function writeAccessCookie(accessToken: string, maxAgeSeconds: number): void {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${accessToken}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function readAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ACCESS_TOKEN_COOKIE}=([^;]*)`)
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** If middleware cookie exists but localStorage was cleared, restore it for API calls. */
export function hydrateAuthStorageFromCookie(): void {
  if (typeof window === "undefined") return;
  const fromCookie = readAccessTokenFromCookie();
  if (!fromCookie) return;
  try {
    if (!localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, fromCookie);
    }
  } catch {
    /* private mode */
  }
}

/** Keep middleware cookie in sync with localStorage (required for /admin, /app). */
export function syncAccessTokenCookie(): void {
  if (typeof window === "undefined") return;
  const token = getAccessToken();
  if (!token) return;
  writeAccessCookie(token, 7 * 24 * 60 * 60);
}

export function setAuthTokens(tokens: AuthTokenPair): void {
  if (typeof window === "undefined") return;

  const accessMaxAge = tokens.accessTokenExpiresIn ?? 15 * 60;

  try {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  } catch {
    /* private mode / storage full */
  }

  writeAccessCookie(tokens.accessToken, accessMaxAge);

  if (tokens.refreshToken) {
    try {
      sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    } catch {
      /* private mode */
    }
  }
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* private mode */
  }
  return readAccessTokenFromCookie();
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

/** @deprecated Use getAccessToken */
export function getClientToken(): string | null {
  return getAccessToken();
}

/** @deprecated Use setAuthTokens */
export function setAuthToken(token: string): void {
  setAuthTokens({ accessToken: token });
}

/** @deprecated Use clearAuthTokens */
export function clearAuthToken(): void {
  clearAuthTokens();
}

export function getDashboardPath(
  role: string,
  permissions?: PermissionGrant[]
): string {
  return getDefaultAppPath(role, permissions);
}
