import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeJwt, jwtVerify } from "jose";
import { ACCESS_TOKEN_COOKIE, AUTH_ROUTES, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants";
import {
  canAccessAppPath,
  decodePermissionsFromJwt,
  getDefaultAppPath,
  isAdminRole,
} from "@/lib/auth/permissions";

const publicPaths = ["/login"];

type AccessPayload = {
  type?: string;
  role?: string;
  permissions?: string[];
  exp?: number;
};

async function verifyToken(token: string): Promise<AccessPayload | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    const p = payload as AccessPayload;
    if (p.type && p.type !== "access") return null;
    return p;
  } catch {
    return null;
  }
}

/** Expired access tokens are allowed through so the client can refresh before the next API call. */
function decodeExpiredAccessToken(token: string): AccessPayload | null {
  try {
    const payload = decodeJwt(token) as AccessPayload;
    if (payload.type && payload.type !== "access") return null;
    if (!payload.role || !payload.exp) return null;
    if (payload.exp * 1000 > Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function applyRoleGuards(
  request: NextRequest,
  pathname: string,
  payload: AccessPayload
): NextResponse | null {
  if (!payload.role) return null;

  const permissions = decodePermissionsFromJwt(payload.permissions ?? []);

  if (pathname.startsWith("/admin")) {
    if (!isAdminRole(payload.role)) {
      return NextResponse.redirect(
        new URL(getDefaultAppPath(payload.role, permissions), request.url)
      );
    }
  }

  if (pathname.startsWith("/app")) {
    if (isAdminRole(payload.role)) {
      return NextResponse.redirect(new URL(AUTH_ROUTES.adminDashboard, request.url));
    }
    if (!canAccessAppPath(payload.role, permissions, pathname)) {
      return NextResponse.redirect(
        new URL(getDefaultAppPath(payload.role, permissions), request.url)
      );
    }
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const hasRefreshCookie = Boolean(
    request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  );

  const isPublic = publicPaths.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );

  if (pathname === "/") {
    if (token) {
      const payload =
        (await verifyToken(token)) ?? decodeExpiredAccessToken(token);
      if (payload?.role) {
        const permissions = decodePermissionsFromJwt(payload.permissions ?? []);
        return NextResponse.redirect(
          new URL(getDefaultAppPath(payload.role, permissions), request.url)
        );
      }
    }
    if (hasRefreshCookie) {
      // Client will refresh via httpOnly cookie, then route by role.
      const loginUrl = new URL(AUTH_ROUTES.login, request.url);
      loginUrl.searchParams.set("redirect", "/app");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL(AUTH_ROUTES.login, request.url));
  }

  if (pathname.startsWith("/warehouse")) {
    const appPath = pathname.replace(/^\/warehouse/, "/app");
    return NextResponse.redirect(new URL(appPath, request.url));
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/app")) {
    if (!token) {
      // Access cookie may be gone while httpOnly refresh cookie remains — let the
      // client load and rotate tokens instead of forcing login.
      if (hasRefreshCookie) {
        return NextResponse.next();
      }
      const loginUrl = new URL(AUTH_ROUTES.login, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const valid = await verifyToken(token);
    const expired = valid?.role ? null : decodeExpiredAccessToken(token);
    const payload = valid?.role ? valid : expired;

    if (!payload?.role) {
      if (hasRefreshCookie) {
        return NextResponse.next();
      }

      const loginUrl = new URL(AUTH_ROUTES.login, request.url);
      if (!process.env.JWT_SECRET) {
        loginUrl.searchParams.set("error", "config");
      }
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
      return response;
    }

    // Role checks apply for both valid and expired JWTs (expired is only a TTL issue).
    const roleRedirect = applyRoleGuards(request, pathname, payload);
    if (roleRedirect) return roleRedirect;
  }

  if (pathname === AUTH_ROUTES.login && token) {
    const payload = await verifyToken(token);
    if (payload?.role) {
      const permissions = decodePermissionsFromJwt(payload.permissions ?? []);
      const redirectParam = request.nextUrl.searchParams.get("redirect");
      const dest =
        redirectParam &&
        redirectParam.startsWith("/") &&
        !redirectParam.startsWith("//")
          ? redirectParam
          : getDefaultAppPath(payload.role, permissions);
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  if (isPublic) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
