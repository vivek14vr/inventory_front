import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ACCESS_TOKEN_COOKIE, AUTH_ROUTES } from "@/lib/auth/constants";
import {
  canAccessAppPath,
  decodePermissionsFromJwt,
  getDefaultAppPath,
  isAdminRole,
} from "@/lib/auth/permissions";

const publicPaths = ["/login"];

async function verifyToken(token: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    const p = payload as {
      type?: string;
      role?: string;
      permissions?: string[];
    };
    if (p.type && p.type !== "access") return null;
    return p;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const isPublic = publicPaths.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );

  if (pathname === "/") {
    if (token) {
      const payload = await verifyToken(token);
      if (payload?.role) {
        const permissions = decodePermissionsFromJwt(payload.permissions ?? []);
        return NextResponse.redirect(
          new URL(getDefaultAppPath(payload.role, permissions), request.url)
        );
      }
    }
    return NextResponse.redirect(new URL(AUTH_ROUTES.login, request.url));
  }

  if (pathname.startsWith("/warehouse")) {
    const appPath = pathname.replace(/^\/warehouse/, "/app");
    return NextResponse.redirect(new URL(appPath, request.url));
  }

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/app")
  ) {
    if (!token) {
      const loginUrl = new URL(AUTH_ROUTES.login, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const payload = await verifyToken(token);
    if (!payload?.role) {
      const loginUrl = new URL(AUTH_ROUTES.login, request.url);
      if (!process.env.JWT_SECRET) {
        loginUrl.searchParams.set("error", "config");
      }
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
      return response;
    }

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
