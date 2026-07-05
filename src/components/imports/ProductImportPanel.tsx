"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { downloadFailedProductImportExcel } from "@/lib/imports/exportFailedProductImport";
import { formatProductUnitSummary } from "@/lib/products/productUnits";
import { formatLowStockImportSummary, formatWarehouseLowStockImportSummary } from "@/lib/imports/formatLowStockImportSummary";
import { formatSecondaryName } from "@/lib/products/productNames";
import type {
  ProductImportPreview,
  ProductImportPreviewRow,
  ProductImportResult,
  ProductImportRowDecision,
} from "@/types/imports";

type RowActionState = {
  brandAction: "merge" | "create";
  mergeTargetBrandId?: string;
  action: "merge" | "create";
  mergeTargetProductId?: string;
};

const DEMO_ROWS = [
  {
    brand: "cream bell",
    primary: "11 inch plate",
    secondary: "plate 11 inch",
    unit: "pieces",
    unitsPerCarton: "800",
    lowCartons: "5",
    lowUnits: "",
    goregaonCartons: "3",
    goregaonUnits: "",
    vasaiCartons: "",
    vasaiUnits: "3200",
  },
];

function initRowActions(preview: ProductImportPreview): Record<number, RowActionState> {
  const states: Record<number, RowActionState> = {};
  for (const row of preview.rows) {
    if (row.errors.length > 0) continue;
    const brandAction = row.brandCategory === "matched" ? "merge" : "create";
    const mergeTargetBrandId = row.matchedBrand?.id;
    states[row.rowNumber] = {
      brandAction,
      mergeTargetBrandId,
      action: row.category === "matched" && row.matchedProduct ? "merge" : "create",
      mergeTargetProductId: row.matchedProduct?.id,
    };
  }
  return states;
}

function resolvedBrandId(
  row: ProductImportPreviewRow,
  state?: RowActionState
): string | undefined {
  const brandAction = state?.brandAction ?? (row.brandCategory === "matched" ? "merge" : "create");
  if (brandAction === "merge") {
    return state?.mergeTargetBrandId ?? row.matchedBrand?.id;
  }
  return undefined;
}

function productsForBrand(
  preview: ProductImportPreview,
  brandId: string | undefined
) {
  if (!brandId) return [];
  return preview.existingProducts.filter((product) => product.brandId === brandId);
}

function mergeProductIdForBrand(
  preview: ProductImportPreview,
  brandId: string | undefined,
  preferredProductId?: string
): string | undefined {
  const brandProducts = productsForBrand(preview, brandId);
  if (preferredProductId && brandProducts.some((p) => p.id === preferredProductId)) {
    return preferredProductId;
  }
  return brandProducts[0]?.id;
}

export function ProductImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [rowActions, setRowActions] = useState<Record<number, RowActionState>>({});
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const matchedRows = useMemo(
    () => preview?.rows.filter((row) => row.category === "matched") ?? [],
    [preview]
  );
  const newRows = useMemo(
    () => preview?.rows.filter((row) => row.category === "new") ?? [],
    [preview]
  );

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setResult(null);
    try {
      const data = await api.imports.previewProducts(file);
      setPreview(data);
      setRowActions(initRowActions(data));
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Failed to read Excel file");
    } finally {
      setLoading(false);
    }
  }

  function updateRowAction(rowNumber: number, patch: Partial<RowActionState>) {
    setRowActions((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], ...patch },
    }));
  }

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      const rows: ProductImportRowDecision[] = preview.rows
        .filter((row) => row.errors.length === 0)
        .map((row) => {
          const state = rowActions[row.rowNumber];
          const brandAction =
            state?.brandAction ?? (row.brandCategory === "matched" ? "merge" : "create");
          const productAction =
            state?.action ?? (row.category === "matched" ? "merge" : "create");
          const mergeTargetBrandId =
            brandAction === "merge"
              ? state?.mergeTargetBrandId ?? row.matchedBrand?.id
              : undefined;
          return {
            rowNumber: row.rowNumber,
            brandName: row.brandName,
            primaryName: row.primaryName,
            secondaryName: row.secondaryName,
            baseUnit: row.baseUnit,
            unitsPerStockUnit: row.unitsPerStockUnit,
            lowStockThreshold: row.lowStockThreshold,
            totalLowStockThreshold: row.totalLowStockThreshold,
            warehouseLowStockThresholds: row.warehouseLowStockThresholds,
            brandAction,
            mergeTargetBrandId,
            action: productAction,
            mergeTargetProductId:
              productAction === "merge"
                ? mergeProductIdForBrand(
                    preview,
                    mergeTargetBrandId,
                    state?.mergeTargetProductId ?? row.matchedProduct?.id
                  )
                : undefined,
          };
        });

      const importResult = await api.imports.confirmProducts({
        fileName: file?.name,
        rows,
      });
      setResult(importResult);
      setSuccess(
        `Import complete: ${importResult.successCount} succeeded, ${importResult.failedCount} failed`
      );
      setPreview(null);
      setRowActions({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setRowActions({});
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Product catalog import</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload an Excel file to add or update products. For each row you can merge the brand
          into an existing one or create a new brand, and merge the product into an existing
          item or create it separately.
        </p>
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Imported products are listed in every active warehouse at zero stock. Use the
          warehouse columns in Excel to set per-location low-stock alerts.
        </p>

        <div className="mt-5 overflow-x-auto rounded-lg border border-emerald-200 bg-emerald-50/40">
          <p className="border-b border-emerald-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900">
            Example format (first sheet)
          </p>
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-emerald-200 text-xs font-semibold uppercase text-emerald-800">
                <th className="px-3 py-2">brand</th>
                <th className="px-3 py-2">product primary name</th>
                <th className="px-3 py-2">product secondary name</th>
                <th className="px-3 py-2">unit</th>
                <th className="px-3 py-2">units in a cartoon</th>
                <th className="px-3 py-2">total low quantity cartoon</th>
                <th className="px-3 py-2">total low quantity unit</th>
                <th className="px-3 py-2">low quantity cartoon in Goregaon</th>
                <th className="px-3 py-2">low quantity unit in Goregaon</th>
                <th className="px-3 py-2">low quantity cartoon in Vasai</th>
                <th className="px-3 py-2">low quantity unit in Vasai</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ROWS.map((row) => (
                <tr key={row.primary} className="border-t border-emerald-100 text-zinc-800">
                  <td className="px-3 py-2">{row.brand}</td>
                  <td className="px-3 py-2">{row.primary}</td>
                  <td className="px-3 py-2">{row.secondary}</td>
                  <td className="px-3 py-2">{row.unit}</td>
                  <td className="px-3 py-2">{row.unitsPerCarton}</td>
                  <td className="px-3 py-2">{row.lowCartons}</td>
                  <td className="px-3 py-2">{row.lowUnits}</td>
                  <td className="px-3 py-2">{row.goregaonCartons}</td>
                  <td className="px-3 py-2">{row.goregaonUnits}</td>
                  <td className="px-3 py-2">{row.vasaiCartons}</td>
                  <td className="px-3 py-2">{row.vasaiUnits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-emerald-200 px-4 py-2 text-xs text-emerald-900/80">
            Use either cartons or units for each total and warehouse column — fill only one
            side of each pair. <strong>Total low quantity</strong> is the combined alert
            across all warehouses (e.g. 50 total even when Goregaon is 10 and Vasai is 30).
            Warehouse names in headers must match active warehouses (e.g. Goregaon, Vasai).
          </p>
        </div>

        <form onSubmit={handlePreview} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Excel file (.xlsx)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? "Change file" : "Choose Excel file"}
              </Button>
              <span className="text-sm text-zinc-600">
                {file ? file.name : "No file selected"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!file || loading}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-60"
            >
              {loading ? "Reading file…" : "Upload & preview"}
            </button>
            {(preview || result) && (
              <Button type="button" variant="secondary" size="sm" onClick={reset}>
                Start over
              </Button>
            )}
          </div>
        </form>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {preview && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
            <span>Total rows: {preview.totalRows}</span>
            <span className="text-indigo-700">Matched: {preview.matchedCount}</span>
            <span className="text-emerald-700">New: {preview.newCount}</span>
            {preview.errorCount > 0 ? (
              <span className="text-red-700">Errors: {preview.errorCount}</span>
            ) : null}
          </div>

          {matchedRows.length > 0 && (
            <ImportReviewTable
              title="Matched products"
              description="These rows match an existing product by brand + primary or secondary name. Default: merge into the existing product."
              rows={matchedRows}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="matched"
            />
          )}

          {newRows.length > 0 && (
            <ImportReviewTable
              title="New products"
              description="No matching product found. Default: create as new. You can merge into an existing product instead."
              rows={newRows}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="new"
            />
          )}

          {preview.rows.some((row) => row.errors.length > 0) && (
            <ImportReviewTable
              title="Rows with errors"
              description="Fix these in your Excel file and re-upload."
              rows={preview.rows.filter((row) => row.errors.length > 0)}
              preview={preview}
              rowActions={rowActions}
              onUpdateAction={updateRowAction}
              mode="errors"
            />
          )}

          <button
            type="button"
            disabled={
              confirming ||
              preview.rows.every((row) => row.errors.length > 0) ||
              preview.errorCount === preview.totalRows
            }
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
          >
            {confirming ? "Importing…" : "Confirm import"}
          </button>
        </div>
      )}

      {result && (
        <ProductImportResultSummary result={result} sourceFileName={result.fileName} />
      )}
    </div>
  );
}

function ImportReviewTable({
  title,
  description,
  rows,
  preview,
  rowActions,
  onUpdateAction,
  mode,
}: {
  title: string;
  description: string;
  rows: ProductImportPreviewRow[];
  preview: ProductImportPreview;
  rowActions: Record<number, RowActionState>;
  onUpdateAction: (rowNumber: number, patch: Partial<RowActionState>) => void;
  mode: "matched" | "new" | "errors";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        <p className="mt-0.5 text-sm text-zinc-600">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Brand (file)</th>
              <th className="px-3 py-2">Brand action</th>
              <th className="px-3 py-2">Primary</th>
              <th className="px-3 py-2">Secondary</th>
              <th className="px-3 py-2">Units</th>
              {mode === "matched" && <th className="px-3 py-2">Product match</th>}
              {mode !== "errors" && <th className="px-3 py-2">Product action</th>}
              {mode === "errors" && <th className="px-3 py-2">Errors</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = rowActions[row.rowNumber];
              const brandAction =
                state?.brandAction ?? (row.brandCategory === "matched" ? "merge" : "create");
              const productAction =
                state?.action ?? (mode === "matched" ? "merge" : "create");
              const brandId = resolvedBrandId(row, state);
              const brandProducts = productsForBrand(preview, brandId);

              return (
                <tr key={row.rowNumber} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{row.brandName}</div>
                    {row.brandCategory === "matched" && row.matchedBrand ? (
                      <div className="text-xs text-indigo-700">
                        Matches {row.matchedBrand.name}
                      </div>
                    ) : row.reactivatesBrand ? (
                      <div className="text-xs text-amber-700">
                        Will reactivate {row.reactivatesBrand.name}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700">New brand name</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-[180px] flex-col gap-2">
                      <select
                        value={brandAction}
                        onChange={(e) => {
                          const next = e.target.value as "merge" | "create";
                          const nextBrandId =
                            next === "merge"
                              ? row.matchedBrand?.id ?? preview.existingBrands[0]?.id
                              : undefined;
                          onUpdateAction(row.rowNumber, {
                            brandAction: next,
                            mergeTargetBrandId: nextBrandId,
                            mergeTargetProductId:
                              productAction === "merge"
                                ? mergeProductIdForBrand(
                                    preview,
                                    nextBrandId,
                                    row.matchedProduct?.id
                                  )
                                : undefined,
                          });
                        }}
                        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                      >
                        {row.brandCategory === "matched" ? (
                          <>
                            <option value="merge">Use existing brand</option>
                            <option value="create">Create new brand</option>
                          </>
                        ) : (
                          <>
                            <option value="create">Create new brand</option>
                            <option value="merge">Merge with existing brand</option>
                          </>
                        )}
                      </select>
                      {brandAction === "merge" ? (
                        <select
                          value={
                            state?.mergeTargetBrandId ??
                            row.matchedBrand?.id ??
                            preview.existingBrands[0]?.id ??
                            ""
                          }
                          onChange={(e) => {
                            const nextBrandId = e.target.value;
                            onUpdateAction(row.rowNumber, {
                              mergeTargetBrandId: nextBrandId,
                              mergeTargetProductId:
                                productAction === "merge"
                                  ? mergeProductIdForBrand(
                                      preview,
                                      nextBrandId,
                                      row.matchedProduct?.id
                                    )
                                  : undefined,
                            });
                          }}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs"
                        >
                          {preview.existingBrands.length === 0 ? (
                            <option value="">No brands in system</option>
                          ) : (
                            preview.existingBrands.map((brand) => (
                              <option key={brand.id} value={brand.id}>
                                {brand.name}
                              </option>
                            ))
                          )}
                        </select>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-zinc-900">{row.primaryName}</td>
                  <td className="px-3 py-2 text-zinc-600">
                    {formatSecondaryName(row.secondaryName)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {formatProductUnitSummary(row)}
                    {row.totalLowStockThreshold != null ? (
                      <div className="text-xs text-zinc-500">
                        Total:{" "}
                        {formatLowStockImportSummary({
                          ...row,
                          lowStockThreshold: row.totalLowStockThreshold,
                        })}
                      </div>
                    ) : null}
                    {row.lowStockThreshold != null ? (
                      <div className="text-xs text-zinc-500">
                        Default: {formatLowStockImportSummary(row)}
                      </div>
                    ) : null}
                    {formatWarehouseLowStockImportSummary(
                      row.warehouseLowStockThresholds,
                      row
                    ).map((line) => (
                      <div key={line} className="text-xs text-amber-800">
                        {line}
                      </div>
                    ))}
                  </td>
                  {mode === "matched" && (
                    <td className="px-3 py-2 text-zinc-600">
                      {row.matchedProduct ? (
                        <>
                          <div className="font-medium">{row.matchedProduct.name}</div>
                          {row.matchedProduct.secondaryName ? (
                            <div className="text-xs">{row.matchedProduct.secondaryName}</div>
                          ) : null}
                          {row.reactivatesProduct ? (
                            <div className="text-xs text-amber-700">
                              Will reactivate {row.reactivatesProduct.name}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {mode !== "errors" && (
                    <td className="px-3 py-2">
                      <div className="flex min-w-[200px] flex-col gap-2">
                        <select
                          value={productAction}
                          onChange={(e) => {
                            const next = e.target.value as "merge" | "create";
                            onUpdateAction(row.rowNumber, {
                              action: next,
                              mergeTargetProductId:
                                next === "merge"
                                  ? mergeProductIdForBrand(
                                      preview,
                                      brandId,
                                      row.matchedProduct?.id
                                    )
                                  : undefined,
                            });
                          }}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          {mode === "matched" ? (
                            <>
                              <option value="merge">Merge into existing product</option>
                              <option value="create">Create separate product</option>
                            </>
                          ) : (
                            <>
                              <option value="create">Create new product</option>
                              <option value="merge">Merge with existing product</option>
                            </>
                          )}
                        </select>
                        {productAction === "merge" ? (
                          <select
                            value={
                              mergeProductIdForBrand(
                                preview,
                                brandId,
                                state?.mergeTargetProductId ?? row.matchedProduct?.id
                              ) ?? ""
                            }
                            onChange={(e) =>
                              onUpdateAction(row.rowNumber, {
                                mergeTargetProductId: e.target.value,
                              })
                            }
                            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs"
                          >
                            {brandProducts.length === 0 ? (
                              <option value="">No products under selected brand</option>
                            ) : (
                              brandProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                  {product.secondaryName ? ` · ${product.secondaryName}` : ""}
                                </option>
                              ))
                            )}
                          </select>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {mode === "errors" && (
                    <td className="px-3 py-2 text-xs text-red-700">{row.errors.join("; ")}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductImportResultSummary({
  result,
  sourceFileName,
}: {
  result: ProductImportResult;
  sourceFileName?: string;
}) {
  const failedCount = result.rows.filter((row) => row.status === "FAILED").length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">Product import result</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {result.warehouses?.length
              ? `Listed in ${result.warehouses.map((w) => w.name).join(", ")} · `
              : ""}
            Success: {result.successCount} · Failed: {result.failedCount}
          </p>
        </div>
        {failedCount > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadFailedProductImportExcel(result, sourceFileName ?? result.fileName)
            }
          >
            Download failed rows (.xlsx)
          </Button>
        ) : null}
      </div>
      <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-zinc-100">
                <td className="px-3 py-2">{row.rowNumber}</td>
                <td className="px-3 py-2">
                  {row.primaryName}
                  {row.secondaryName ? ` · ${row.secondaryName}` : ""}
                  <div className="text-xs text-zinc-500">{row.brandName}</div>
                </td>
                <td className="px-3 py-2 capitalize">{row.action}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      row.status === "SUCCESS"
                        ? "font-medium text-emerald-700"
                        : row.status === "FAILED"
                          ? "font-medium text-red-700"
                          : "font-medium text-amber-700"
                    }
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
