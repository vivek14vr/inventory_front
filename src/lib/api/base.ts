/**
 * Browser: same-origin `/api/v1` via Next.js rewrite (works on mobile LAN IP).
 * Server: full backend URL from env.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://127.0.0.1:4000/api/v1"
  );
}

/**
 * Build an absolute URL for fetch(). Required because `new URL("/api/v1/...")`
 * without a base throws "Failed to construct 'URL': Invalid URL".
 */
export function buildApiUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase().replace(/\/$/, "");
  const pathname = `${base}${normalizedPath}`;

  if (base.startsWith("http://") || base.startsWith("https://")) {
    return new URL(pathname);
  }

  if (typeof window !== "undefined") {
    return new URL(pathname, window.location.origin);
  }

  return new URL(pathname, getServerOrigin());
}

function getServerOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel}`;
  }
  return "http://127.0.0.1:3000";
}

/** String URL for simple fetch calls (relative path works in browser). */
export function apiUrl(path: string): string {
  return buildApiUrl(path).toString();
}
