"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { api, ApiError } from "@/lib/api/client";
import { refreshSession } from "@/lib/api/authSession";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  clearAuthTokens,
  getAccessTokenIfValid,
  getDashboardPath,
  hydrateAuthStorageFromCookie,
  msUntilAccessTokenRefresh,
  setAuthTokens,
  syncAccessTokenCookie,
  getAccessToken,
} from "@/lib/auth/token";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function safeRedirectPath(): string | null {
  if (typeof window === "undefined") return null;
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return null;
  }
  return redirect;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loginInProgressRef = useRef(false);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    if (loginInProgressRef.current) return null;

    hydrateAuthStorageFromCookie();

    let token = getAccessTokenIfValid();
    if (!token) {
      const session = await refreshSession();
      if (session) {
        setUser(session.user);
        token = session.accessToken;
      }
    }
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const me = await api.auth.me(token);
      setUser(me);
      syncAccessTokenCookie();
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        const session = await refreshSession();
        if (session) {
          try {
            const me = await api.auth.me(session.accessToken);
            setUser(me);
            syncAccessTokenCookie();
            return me;
          } catch {
            /* fall through to logout */
          }
        }
        clearAuthTokens();
        setUser(null);
        return null;
      }
      if (err instanceof ApiError && err.statusCode === 0) {
        return null;
      }
    }
    return null;
  }, []);

  // Keep access token + AuthContext.user permissions in sync.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = (delayMs?: number) => {
      if (cancelled) return;
      const token = getAccessToken();
      // Refresh uses httpOnly cookie; only schedule while we still have an access token.
      if (!token) return;

      const delay =
        delayMs ??
        (msUntilAccessTokenRefresh(token) ?? 30_000);
      if (delay == null) return;

      timer = window.setTimeout(async () => {
        if (cancelled) return;
        const session = await refreshSession();
        if (session) {
          setUser(session.user);
          syncAccessTokenCookie();
          schedule();
          return;
        }
        if (!getAccessTokenIfValid()) {
          setUser(null);
          window.location.href = AUTH_ROUTES.login;
          return;
        }
        // Transient refresh failure — back off instead of a tight retry loop.
        schedule(30_000);
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [user?.id]);

  // Refresh permissions when the tab becomes visible again.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (!getAccessToken()) return;
      void refreshUser();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshUser]);

  useEffect(() => {
    let cancelled = false;

    if (pathname === AUTH_ROUTES.login) {
      const hasLocalAuth = Boolean(getAccessToken());
      const hasRedirect = Boolean(safeRedirectPath());
      // No local tokens and not bounced from a protected page — stay on login.
      // If `redirect` is set, still try refresh via httpOnly cookie.
      if (!hasLocalAuth && !hasRedirect) {
        setLoading(false);
        return;
      }
      void refreshUser()
        .then((me) => {
          if (cancelled || !me) return;
          const redirect = safeRedirectPath();
          const dest =
            redirect ?? getDashboardPath(me.role, me.permissions);
          window.location.replace(dest);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // Always re-fetch /auth/me on navigation so permission changes apply
    // without waiting for the access-token TTL.
    void refreshUser().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    loginInProgressRef.current = true;
    try {
      const result = await api.auth.login(email, password);
      const accessToken = result.accessToken ?? result.token;
      if (!accessToken) {
        throw new Error("Login response missing access token");
      }

      setAuthTokens({
        accessToken,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
        refreshToken: result.refreshToken,
        refreshTokenExpiresIn: result.refreshTokenExpiresIn,
      });
      setUser(result.user);
      syncAccessTokenCookie();

      const redirect = safeRedirectPath();
      const dest =
        redirect ??
        getDashboardPath(result.user.role, result.user.permissions);

      await new Promise((resolve) => setTimeout(resolve, 150));
      window.location.replace(dest);
    } finally {
      loginInProgressRef.current = false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* session may already be invalid */
    }
    clearAuthTokens();
    setUser(null);
    window.location.href = AUTH_ROUTES.login;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
