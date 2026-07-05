import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AuthUser } from "@/types/auth";
import { TOKEN_COOKIE } from "./constants";

type JwtClaims = {
  sub: string;
  email: string;
  role: "ADMIN" | "WAREHOUSE_USER";
  warehouseId?: string;
};

export async function getTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value;
}

export async function verifyToken(token: string): Promise<JwtClaims | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    return payload as unknown as JwtClaims;
  } catch {
    return null;
  }
}

export async function getSessionClaims(): Promise<JwtClaims | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;
  return verifyToken(token);
}

export async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok || !body.success) return null;
    return body.data as AuthUser;
  } catch {
    return null;
  }
}
