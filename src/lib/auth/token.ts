import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
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

/** Decode JWT `exp` (seconds since epoch). Returns null if missing or malformed. */
export function decodeJwtExp(token: string): number | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const payload = JSON.parse(
      atob(segment.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True when the access token is expired or within `bufferSeconds` of expiry. */
export function isAccessTokenExpired(
  token: string,
  bufferSeconds = 60
): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  return Date.now() >= (exp - bufferSeconds) * 1000;
}

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

/**
 * Access cookie must outlive the JWT. Middleware keeps an expired JWT so the
 * client can refresh; if the cookie dies with the JWT, users get bounced to login.
 */
function accessCookieMaxAge(preferredSeconds?: number): number {
  if (preferredSeconds && preferredSeconds > 0) {
    return Math.max(preferredSeconds, 60);
  }
  return ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS;
}

function readRefreshTokenFromStorage(): string | null {
  return null;
}

function clearRefreshTokenStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/** @deprecated Refresh lives in httpOnly cookie only — never JS storage. */
function migrateRefreshTokenStorage(): void {
  clearRefreshTokenStorage();
}

/** If middleware cookie exists but localStorage was cleared, restore it for API calls. */
export function hydrateAuthStorageFromCookie(): void {
  if (typeof window === "undefined") return;
  clearRefreshTokenStorage();
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
  // Keep cookie even when JWT is expired so middleware can allow a client refresh.
  writeAccessCookie(token, accessCookieMaxAge());
}

export function setAuthTokens(tokens: AuthTokenPair): void {
  if (typeof window === "undefined") return;

  const cookieMaxAge = accessCookieMaxAge(tokens.refreshTokenExpiresIn);

  try {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  } catch {
    /* private mode / storage full */
  }

  writeAccessCookie(tokens.accessToken, cookieMaxAge);
  // Refresh token is httpOnly-only — never persist in JS storage (XSS).
  clearRefreshTokenStorage();
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  clearRefreshTokenStorage();
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
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

/** Returns the access token only if it is still valid (with 60s buffer). */
export function getAccessTokenIfValid(): string | null {
  const token = getAccessToken();
  if (!token || isAccessTokenExpired(token)) return null;
  return token;
}

/** Refresh is httpOnly cookie only — always null from JS. */
export function getRefreshToken(): string | null {
  clearRefreshTokenStorage();
  return null;
}

/** Milliseconds until proactive refresh should run (1 min before expiry). */
export function msUntilAccessTokenRefresh(token: string): number | null {
  const exp = decodeJwtExp(token);
  if (!exp) return null;
  return Math.max(exp * 1000 - Date.now() - 60_000, 0);
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
