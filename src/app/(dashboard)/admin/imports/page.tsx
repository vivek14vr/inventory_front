"use client";

import { useState } from "react";
import { ProductImportPanel } from "@/components/imports/ProductImportPanel";
import { SalesImportPanel } from "@/components/imports/SalesImportPanel";

type ImportMode = "products" | "sales";

export default function AdminImportsPage() {
  const [mode, setMode] = useState<ImportMode>("products");

  return (
    <div className="space-y-8 text-zinc-900">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Imports</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Import products from Excel or record direct-sell stock outs from a Tally-style sales
          register. Both flows let you preview and merge matches before updating the system.
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
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

      {mode === "products" ? <ProductImportPanel /> : <SalesImportPanel />}
    </div>
  );
}
