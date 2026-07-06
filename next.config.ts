import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiProxyTarget =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";
const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Next.js blocks /_next/* when the browser host differs from the dev server host.
 * Wildcards are not supported — add your LAN IP from `ipconfig getifaddr en0`.
 */
const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "192.168.1.4",
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ??
    []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  turbopack: {
    root: resolve(projectRoot, ".."),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/app/receive",
        destination: "/app/transfer",
        permanent: true,
      },
      {
        source: "/admin/receive",
        destination: "/admin/transfer",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
