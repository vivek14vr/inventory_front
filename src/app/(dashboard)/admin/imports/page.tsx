"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClientImportPanel } from "@/components/imports/ClientImportPanel";
import { ProductImportPanel } from "@/components/imports/ProductImportPanel";
import { SalesImportPanel } from "@/components/imports/SalesImportPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";

type ImportMode = "products" | "sales" | "clients";

type ModeMeta = {
  id: ImportMode;
  label: string;
  hint: string;
};

const MODE_META: Record<ImportMode, ModeMeta> = {
  products: {
    id: "products",
    label: "Product catalog",
    hint: "Company-wide SKUs & low-stock alerts",
  },
  clients: {
    id: "clients",
    label: "Import clients",
    hint: "Company-wide customer list",
  },
  sales: {
    id: "sales",
    label: "Direct sell / stock out",
    hint: "Tally sales · per warehouse",
  },
};

function parseImportMode(
  value: string | null,
  allowed: ImportMode[]
): ImportMode | null {
  if (value === "sales" || value === "clients" || value === "products") {
    if (allowed.includes(value)) return value;
  }
  return allowed[0] ?? null;
}

function AdminImportsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can, isAdmin } = usePermissions();

  const canProducts =
    isAdmin || can(Permission.IMPORTS_PRODUCTS) || can(Permission.IMPORTS_MANAGE);
  const canClients =
    isAdmin || can(Permission.IMPORTS_CLIENTS) || can(Permission.IMPORTS_MANAGE);
  const canSales =
    isAdmin || can(Permission.IMPORTS_SALES) || can(Permission.IMPORTS_MANAGE);

  const allowedModes = useMemo(() => {
    const modes: ImportMode[] = [];
    if (canProducts) modes.push("products");
    if (canClients) modes.push("clients");
    if (canSales) modes.push("sales");
    return modes;
  }, [canProducts, canClients, canSales]);

  const [mode, setMode] = useState<ImportMode | null>(() =>
    parseImportMode(searchParams.get("mode"), allowedModes)
  );

  useEffect(() => {
    setMode(parseImportMode(searchParams.get("mode"), allowedModes));
  }, [searchParams, allowedModes]);

  function selectMode(next: ImportMode) {
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (allowedModes.length === 0) {
    return (
      <div className="space-y-6 text-zinc-900">
        <PageHeader
          title="Imports"
          description="You do not have permission to import products, clients, or sales."
        />
      </div>
    );
  }

  const activeMode = mode ?? allowedModes[0]!;

  return (
    <div className="space-y-8 text-zinc-900">
      <PageHeader
        title="Imports"
        description="Upload Excel, preview matches, then confirm. Product and client imports apply company-wide; sales stock-out is limited to warehouses you can access."
      />

      {allowedModes.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allowedModes.map((id) => {
            const meta = MODE_META[id];
            const active = activeMode === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => selectMode(id)}
                className={`rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.99] ${
                  active
                    ? "border-orange-600 bg-orange-600 text-white shadow-md shadow-orange-900/15"
                    : "border-stone-200 bg-white text-stone-800 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <span className="block text-base font-bold leading-tight">
                  {meta.label}
                </span>
                <span
                  className={`mt-1 block text-sm font-medium ${
                    active ? "text-orange-100" : "text-stone-500"
                  }`}
                >
                  {meta.hint}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeMode === "products" ? (
        <ProductImportPanel />
      ) : activeMode === "clients" ? (
        <ClientImportPanel />
      ) : (
        <SalesImportPanel />
      )}
    </div>
  );
}

export default function AdminImportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading imports…" />
        </div>
      }
    >
      <AdminImportsPageContent />
    </Suspense>
  );
}
