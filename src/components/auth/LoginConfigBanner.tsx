"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function BannerInner() {
  const params = useSearchParams();
  if (params.get("error") !== "config") return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      Server config error: set <code className="text-xs">JWT_SECRET</code> in{" "}
      <code className="text-xs">frontend/.env.local</code> to the same value as{" "}
      <code className="text-xs">backend/.env</code>, then restart the dev server.
    </div>
  );
}

export function LoginConfigBanner() {
  return (
    <Suspense fallback={null}>
      <BannerInner />
    </Suspense>
  );
}
