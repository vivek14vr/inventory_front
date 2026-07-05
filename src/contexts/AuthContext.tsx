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
import { refreshAccessToken } from "@/lib/api/authSession";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  clearAuthTokens,
  getAccessToken,
  getDashboardPath,
  hydrateAuthStorageFromCookie,
  setAuthTokens,
  syncAccessTokenCookie,
} from "@/lib/auth/token";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  const refreshUser = useCallback(async () => {
    if (loginInProgressRef.current) return;

    hydrateAuthStorageFromCookie();
    syncAccessTokenCookie();

    let token = getAccessToken();
    if (!token) {
      token = await refreshAccessToken();
    }
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const me = await api.auth.me(token);
      setUser(me);
      syncAccessTokenCookie();
      return;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          try {
            const me = await api.auth.me(refreshed);
            setUser(me);
            syncAccessTokenCookie();
            return;
          } catch {
            /* fall through to logout */
          }
        }
        clearAuthTokens();
        setUser(null);
        return;
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (pathname === AUTH_ROUTES.login) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
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
