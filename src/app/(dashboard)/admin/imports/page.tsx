"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClientImportPanel } from "@/components/imports/ClientImportPanel";
import { ProductImportPanel } from "@/components/imports/ProductImportPanel";
import { SalesImportPanel } from "@/components/imports/SalesImportPanel";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ImportMode = "products" | "sales" | "clients";

function parseImportMode(value: string | null): ImportMode {
  if (value === "sales") return "sales";
  if (value === "clients") return "clients";
  return "products";
}

function AdminImportsPageContent() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ImportMode>(() =>
    parseImportMode(searchParams.get("mode"))
  );

  useEffect(() => {
    setMode(parseImportMode(searchParams.get("mode")));
  }, [searchParams]);

  return (
    <div className="space-y-8 text-zinc-900">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Imports</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Import products or clients from Excel, or record direct-sell stock outs from a
          Tally-style sales register. All flows let you preview and merge matches before
          updating the system.
        </p>
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        <button
          type="button"
          onClick={() => setMode("products")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "products"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Product catalog
        </button>
        <button
          type="button"
          onClick={() => setMode("clients")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "clients"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Import clients
        </button>
        <button
          type="button"
          onClick={() => setMode("sales")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "sales"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Direct sell / stock out
        </button>
      </div>

      {mode === "products" ? (
        <ProductImportPanel />
      ) : mode === "clients" ? (
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
