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

function accessCookieMaxAge(token: string, fallbackSeconds = 15 * 60): number {
  const exp = decodeJwtExp(token);
  if (!exp) return fallbackSeconds;
  return Math.max(exp - Math.floor(Date.now() / 1000), 60);
}

function readRefreshTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRefreshTokenToStorage(refreshToken: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  } catch {
    /* private mode / storage full */
  }
}

/** Migrate refresh token from sessionStorage (older builds) into localStorage. */
function migrateRefreshTokenStorage(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) return;
    const legacy = sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, legacy);
      sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* private mode */
  }
}

/** If middleware cookie exists but localStorage was cleared, restore it for API calls. */
export function hydrateAuthStorageFromCookie(): void {
  if (typeof window === "undefined") return;
  migrateRefreshTokenStorage();
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
  if (!token || isAccessTokenExpired(token, 0)) return;
  writeAccessCookie(token, accessCookieMaxAge(token));
}

export function setAuthTokens(tokens: AuthTokenPair): void {
  if (typeof window === "undefined") return;

  const accessMaxAge = tokens.accessTokenExpiresIn ?? accessCookieMaxAge(tokens.accessToken);

  try {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  } catch {
    /* private mode / storage full */
  }

  writeAccessCookie(tokens.accessToken, accessMaxAge);

  if (tokens.refreshToken) {
    writeRefreshTokenToStorage(tokens.refreshToken);
    try {
      sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
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

/** Returns the access token only if it is still valid (with 60s buffer). */
export function getAccessTokenIfValid(): string | null {
  const token = getAccessToken();
  if (!token || isAccessTokenExpired(token)) return null;
  return token;
}

export function getRefreshToken(): string | null {
  migrateRefreshTokenStorage();
  return readRefreshTokenFromStorage();
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
