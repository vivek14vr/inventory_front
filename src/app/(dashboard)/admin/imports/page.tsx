"use client";

import { ProductImportPanel } from "@/components/imports/ProductImportPanel";

export default function AdminImportsPage() {
  return (
    <div className="space-y-8 text-zinc-900">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Imports</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Import a product catalog from Excel. Matching products can be merged into the existing
          item, and new products can be created or merged with an existing one.
        </p>
      </div>

      <ProductImportPanel />
    </div>
  );
}
