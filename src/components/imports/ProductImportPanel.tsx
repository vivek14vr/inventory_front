"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  ImportExampleCard,
  ImportPreviewStats,
  ImportTip,
  ImportUploadForm,
} from "@/components/imports/ImportUploadForm";
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

    const validationErrors: string[] = [];
    for (const row of preview.rows.filter((item) => item.errors.length === 0)) {
      const state = rowActions[row.rowNumber];
      const brandAction =
        state?.brandAction ?? (row.brandCategory === "matched" ? "merge" : "create");
      const productAction =
        state?.action ?? (row.category === "matched" ? "merge" : "create");
      const mergeTargetBrandId =
        brandAction === "merge"
          ? state?.mergeTargetBrandId ?? row.matchedBrand?.id
          : undefined;
      const mergeTargetProductId =
        productAction === "merge"
          ? mergeProductIdForBrand(
              preview,
              mergeTargetBrandId,
              state?.mergeTargetProductId ?? row.matchedProduct?.id
            )
          : undefined;

      if (brandAction === "merge" && !mergeTargetBrandId) {
        validationErrors.push(`Row ${row.rowNumber}: select a brand to merge into`);
      }
      if (productAction === "merge" && !mergeTargetProductId) {
        validationErrors.push(`Row ${row.rowNumber}: select a product to merge into`);
      }
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" · "));
      return;
    }

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
      <ImportUploadForm
        title="Product catalog"
        description="Add or update products from Excel. For each row you can merge into an existing brand/product or create new ones."
        file={file}
        fileInputRef={fileInputRef}
        loading={loading}
        showReset={Boolean(preview || result)}
        onFileChange={(next) => {
          setFile(next);
          setPreview(null);
          setResult(null);
        }}
        onSubmit={handlePreview}
        onReset={reset}
        tip={
          <ImportTip>
            Imported products appear in every active warehouse at{" "}
            <strong className="font-semibold text-stone-900">zero stock</strong>.
            Use warehouse columns in Excel for per-location low-stock alerts.
          </ImportTip>
        }
        example={
          <ImportExampleCard
            title="Example columns"
            footnote={
              <>
                Three independent low-stock alerts per product:{" "}
                <strong className="font-semibold text-stone-700">total</strong>{" "}
                overall, plus one carton/unit pair per warehouse (e.g. Goregaon,
                Vasai). Fill only one side of each pair. Blank values default to
                10 cartons. Legacy column{" "}
                <strong className="font-semibold text-stone-700">
                  low quantity cartoon
                </strong>{" "}
                also maps to total low.
              </>
            }
          >
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-white text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  <th className="whitespace-nowrap px-3 py-2.5">Brand</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Primary name</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Secondary</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Unit</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Units / carton</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Total low (cartons)</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Total low (units)</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Goregaon cartons</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Goregaon units</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Vasai cartons</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Vasai units</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map((row) => (
                  <tr
                    key={row.primary}
                    className="border-t border-stone-100 bg-white/70 text-stone-800"
                  >
                    <td className="px-3 py-2.5 font-medium">{row.brand}</td>
                    <td className="px-3 py-2.5">{row.primary}</td>
                    <td className="px-3 py-2.5 text-stone-500">{row.secondary}</td>
                    <td className="px-3 py-2.5">{row.unit}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.unitsPerCarton}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.lowCartons || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.lowUnits || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.goregaonCartons || "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.goregaonUnits || "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.vasaiCartons || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.vasaiUnits || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ImportExampleCard>
        }
      />

      <Alert message={error} />
      <Alert message={success} type="success" />

      {preview && (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
              Step 2 · Review & confirm
            </p>
            <h3 className="mt-1 text-lg font-bold text-stone-900">
              Preview results
            </h3>
          </div>

          <ImportPreviewStats
            items={[
              { label: "Total rows", value: preview.totalRows },
              {
                label: "Matched",
                value: preview.matchedCount,
                tone: "info",
              },
              { label: "New", value: preview.newCount, tone: "success" },
              ...(preview.errorCount > 0
                ? [
                    {
                      label: "Errors",
                      value: preview.errorCount,
                      tone: "danger" as const,
                    },
                  ]
                : []),
            ]}
          />

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

          <Button
            type="button"
            size="lg"
            disabled={
              confirming ||
              preview.rows.every((row) => row.errors.length > 0) ||
              preview.errorCount === preview.totalRows
            }
            loading={confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? "Importing…" : "Confirm import"}
          </Button>
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
                    ) : (
                      <div className="text-xs text-zinc-400">
                        Total: defaults to 10 cartons
                      </div>
                    )}
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
