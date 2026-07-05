"use client";

import { useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { WarehouseSelect } from "@/components/stock/WarehouseSelect";
import { downloadFailedSalesImportExcel } from "@/lib/imports/exportFailedSalesImport";
import { formatSecondaryName } from "@/lib/products/productNames";
import type {
  SalesImportExistingBrand,
  SalesImportExistingProduct,
  SalesImportLinePreview,
  SalesImportPreview,
  SalesImportResult,
  SalesImportVoucherPreview,
} from "@/types/imports";

type LineActionState = {
  action: "merge" | "create";
  mergeTargetProductId?: string;
  createBrandId?: string;
};

function initLineActions(preview: SalesImportPreview): Record<number, LineActionState> {
  const states: Record<number, LineActionState> = {};
  for (const voucher of preview.vouchers) {
    for (const line of voucher.lines) {
      if (line.errors.length > 0) continue;
      states[line.rowNumber] = {
        action: line.matchedProduct ? "merge" : "create",
        mergeTargetProductId: line.matchedProduct?.id,
      };
    }
  }
  return states;
}

function lineActionFor(
  line: SalesImportLinePreview,
  state: LineActionState | undefined
): LineActionState {
  return {
    action: state?.action ?? (line.matchedProduct ? "merge" : "create"),
    mergeTargetProductId: state?.mergeTargetProductId ?? line.matchedProduct?.id,
    createBrandId: state?.createBrandId,
  };
}

function lineIsReady(
  line: SalesImportLinePreview,
  state: LineActionState | undefined,
  defaultBrandId: string
): boolean {
  if (line.errors.length > 0) return false;
  const resolved = lineActionFor(line, state);
  if (resolved.action === "merge") {
    return Boolean(resolved.mergeTargetProductId);
  }
  return Boolean(resolved.createBrandId || defaultBrandId);
}

function suggestProducts(
  products: SalesImportExistingProduct[],
  label: string,
  limit = 12
): SalesImportExistingProduct[] {
  const needle = label.trim().toLowerCase();
  if (!needle) return products.slice(0, limit);

  const scored = products
    .map((product) => {
      const labels = [product.name, product.secondaryName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().toLowerCase());

      let score = 0;
      for (const candidate of labels) {
        if (candidate === needle) score = Math.max(score, 100);
        else if (candidate.includes(needle) || needle.includes(candidate)) score = Math.max(score, 70);
        else {
          const tokens = needle.split(/\s+/).filter((token) => token.length > 2);
          const overlap = tokens.filter((token) => candidate.includes(token)).length;
          score = Math.max(score, overlap * 12);
        }
      }

      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.product);

  return scored.length > 0 ? scored : products.slice(0, limit);
}

function productLabel(product: SalesImportExistingProduct): string {
  const secondary = formatSecondaryName(product.secondaryName);
  return secondary
    ? `${product.name} (${secondary}) — ${product.brandName}`
    : `${product.name} — ${product.brandName}`;
}

export function SalesImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [defaultBrandId, setDefaultBrandId] = useState("");
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [lineActions, setLineActions] = useState<Record<number, LineActionState>>({});
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createLineCount = useMemo(() => {
    if (!preview) return 0;
    return preview.vouchers.reduce((count, voucher) => {
      for (const line of voucher.lines) {
        if (line.errors.length > 0) continue;
        const state = lineActions[line.rowNumber];
        const action = state?.action ?? (line.matchedProduct ? "merge" : "create");
        if (action === "create") count++;
      }
      return count;
    }, 0);
  }, [preview, lineActions]);

  const allLinesReady = useMemo(() => {
    if (!preview) return false;
    if (!warehouseId) return false;
    if (createLineCount > 0 && !defaultBrandId) return false;

    const importableLines = preview.vouchers.flatMap((voucher) =>
      voucher.lines.filter((line) => line.errors.length === 0)
    );
    if (importableLines.length === 0) return false;

    return importableLines.every((line) =>
      lineIsReady(line, lineActions[line.rowNumber], defaultBrandId)
    );
  }, [preview, lineActions, warehouseId, defaultBrandId, createLineCount]);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setResult(null);
    try {
      const data = await api.imports.previewSales(file);
      setPreview(data);
      setLineActions(initLineActions(data));
      setDefaultBrandId(data.existingBrands[0]?.id ?? "");
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Failed to read Excel file");
    } finally {
      setLoading(false);
    }
  }

  function updateLineAction(rowNumber: number, patch: Partial<LineActionState>) {
    setLineActions((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], ...patch },
    }));
  }

  async function handleConfirm() {
    if (!preview || !warehouseId) return;
    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      const vouchers = preview.vouchers
        .map((voucher) => ({
          voucherIndex: voucher.voucherIndex,
          headerRowNumber: voucher.headerRowNumber,
          sellDate: voucher.sellDate,
          clientName: voucher.clientName,
          invoiceNumber: voucher.invoiceNumber,
          lines: voucher.lines
            .filter((line) => line.errors.length === 0)
            .map((line) => {
              const state = lineActionFor(line, lineActions[line.rowNumber]);
              const createBrandId = state.createBrandId || defaultBrandId;
              return {
                rowNumber: line.rowNumber,
                productName: line.productName,
                quantity: line.quantity,
                action: state.action,
                mergeTargetProductId:
                  state.action === "merge" ? state.mergeTargetProductId : undefined,
                createBrandId: state.action === "create" ? createBrandId : undefined,
              };
            })
            .filter(
              (line) =>
                (line.action === "merge" && line.mergeTargetProductId) ||
                (line.action === "create" && line.createBrandId)
            ),
        }))
        .filter((voucher) => voucher.lines.length > 0);

      const importResult = await api.imports.confirmSales({
        fileName: file?.name,
        warehouseId,
        vouchers,
      });
      setResult(importResult);
      setSuccess(
        `Import complete: ${importResult.successCount} line(s) succeeded, ${importResult.failedCount} failed` +
          (importResult.createdProductCount
            ? `, ${importResult.createdProductCount} new product(s) created`
            : "") +
          ` across ${importResult.totalVouchers} invoice(s)`
      );
      setPreview(null);
      setLineActions({});
      setDefaultBrandId("");
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
    setLineActions({});
    setDefaultBrandId("");
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Direct sell / stock out import</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload a Tally sales register Excel. A <strong>dated row</strong> starts each invoice
          (client in Particulars, voucher no. in column E — quantity on that row is ignored).
          The <strong>rows below</strong> without a date are products: name in Particulars,
          quantity in column F (base units, not cartons).
        </p>

        <div className="mt-5 overflow-x-auto rounded-lg border border-sky-200 bg-sky-50/40">
          <p className="border-b border-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-sky-900">
            Column layout (header row detected automatically)
          </p>
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-sky-200 text-xs font-semibold uppercase text-sky-800">
                <th className="px-3 py-2">A — Date</th>
                <th className="px-3 py-2">B — Particulars</th>
                <th className="px-3 py-2">C</th>
                <th className="px-3 py-2">D</th>
                <th className="px-3 py-2">E — Voucher no.</th>
                <th className="px-3 py-2">F — Quantity</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-sky-100 text-zinc-800">
                <td className="px-3 py-2">01-Jul-26</td>
                <td className="px-3 py-2 font-medium">Sandhya (client)</td>
                <td className="px-3 py-2 text-zinc-400">ignore</td>
                <td className="px-3 py-2 text-zinc-400">ignore</td>
                <td className="px-3 py-2">1748</td>
                <td className="px-3 py-2 text-zinc-400">ignore</td>
              </tr>
              <tr className="border-t border-sky-100 text-zinc-800">
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2">1000ml Rectangle Container (DP)</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2">1000</td>
              </tr>
              <tr className="border-t border-sky-100 text-zinc-800">
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2">300ml Plastic Container (Black)</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2 text-zinc-400">—</td>
                <td className="px-3 py-2">500</td>
              </tr>
            </tbody>
          </table>
          <p className="border-t border-sky-200 px-4 py-2 text-xs text-sky-900/80">
            The importer finds the row with Date / Particulars / Voucher No. / Quantity and starts
            from the next row. Extra columns (Buyer, CGST, SGST, etc.) are ignored. Product rows
            sit directly under the client row until the next dated row. Cancelled vouchers and
            Grand Total are skipped.
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
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <WarehouseSelect
              value={warehouseId}
              onChange={setWarehouseId}
              label="Stock out from warehouse"
            />
            {createLineCount > 0 ? (
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Default brand for new products
                </label>
                <select
                  className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={defaultBrandId}
                  onChange={(e) => setDefaultBrandId(e.target.value)}
                >
                  <option value="">Select brand…</option>
                  {preview.existingBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {createLineCount} line(s) will create new products under this brand unless you
                  pick a different brand per row.
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
            <span>Invoices: {preview.totalVouchers}</span>
            <span>Product lines: {preview.totalLines}</span>
            <span className="text-indigo-700">Matched: {preview.matchedCount}</span>
            <span className="text-amber-700">Unmatched: {preview.unmatchedCount}</span>
            {preview.errorCount > 0 ? (
              <span className="text-red-700">Errors: {preview.errorCount}</span>
            ) : null}
          </div>

          {preview.vouchers.map((voucher) => (
            <VoucherReviewCard
              key={voucher.voucherIndex}
              voucher={voucher}
              products={preview.existingProducts}
              brands={preview.existingBrands}
              defaultBrandId={defaultBrandId}
              lineActions={lineActions}
              onUpdateLine={updateLineAction}
            />
          ))}

          <button
            type="button"
            disabled={confirming || !allLinesReady}
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
          >
            {confirming ? "Importing…" : "Confirm stock out import"}
          </button>
        </div>
      )}

      {result && <SalesImportResultSummary result={result} sourceFileName={result.fileName} />}
    </div>
  );
}

function VoucherReviewCard({
  voucher,
  products,
  brands,
  defaultBrandId,
  lineActions,
  onUpdateLine,
}: {
  voucher: SalesImportVoucherPreview;
  products: SalesImportExistingProduct[];
  brands: SalesImportExistingBrand[];
  defaultBrandId: string;
  lineActions: Record<number, LineActionState>;
  onUpdateLine: (rowNumber: number, patch: Partial<LineActionState>) => void;
}) {
  const hasLineErrors = voucher.lines.some((line) => line.errors.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="font-semibold text-zinc-900">
            Invoice {voucher.invoiceNumber || "—"}
          </h3>
          <span className="text-sm text-zinc-600">{voucher.clientName || "No client"}</span>
          {voucher.sellDate ? (
            <span className="text-sm text-zinc-500">{voucher.sellDate}</span>
          ) : null}
          <span className="text-xs text-zinc-400">Header row {voucher.headerRowNumber}</span>
        </div>
        {voucher.errors.length > 0 ? (
          <p className="mt-1 text-sm text-red-700">{voucher.errors.join("; ")}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-white text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Product (file)</th>
              <th className="px-3 py-2">Qty (units)</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">Product action</th>
            </tr>
          </thead>
          <tbody>
            {voucher.lines.map((line) => (
              <LineReviewRow
                key={line.rowNumber}
                line={line}
                products={products}
                brands={brands}
                defaultBrandId={defaultBrandId}
                state={lineActions[line.rowNumber]}
                onUpdate={(patch) => onUpdateLine(line.rowNumber, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {hasLineErrors ? (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-red-700">
          Lines with errors will be skipped. Fix them in Excel and re-upload, or map / create
          products below.
        </p>
      ) : null}
    </div>
  );
}

function LineReviewRow({
  line,
  products,
  brands,
  defaultBrandId,
  state,
  onUpdate,
}: {
  line: SalesImportLinePreview;
  products: SalesImportExistingProduct[];
  brands: SalesImportExistingBrand[];
  defaultBrandId: string;
  state?: LineActionState;
  onUpdate: (patch: Partial<LineActionState>) => void;
}) {
  const resolved = lineActionFor(line, state);
  const suggestions = useMemo(
    () => suggestProducts(products, line.productName),
    [products, line.productName]
  );
  const hasErrors = line.errors.length > 0;
  const brandId = resolved.createBrandId || defaultBrandId;
  const brandName = brands.find((brand) => brand.id === brandId)?.name;

  return (
    <tr className={`border-t border-zinc-100 ${hasErrors ? "bg-red-50/40" : ""}`}>
      <td className="px-3 py-2 text-zinc-500">{line.rowNumber}</td>
      <td className="px-3 py-2 font-medium text-zinc-900">{line.productName}</td>
      <td className="px-3 py-2">{line.quantity}</td>
      <td className="px-3 py-2">
        {line.category === "matched" && line.matchedProduct ? (
          <span className="text-indigo-700">
            {line.matchedProduct.name} ({line.matchedProduct.brandName})
          </span>
        ) : (
          <span className="text-amber-700">No exact match</span>
        )}
        {hasErrors ? (
          <div className="mt-1 text-xs text-red-700">{line.errors.join("; ")}</div>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {hasErrors && !line.matchedProduct ? (
          <span className="text-xs text-zinc-500">Fix errors first</span>
        ) : (
          <div className="flex min-w-[280px] flex-col gap-2">
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={resolved.action}
              onChange={(e) =>
                onUpdate({
                  action: e.target.value as "merge" | "create",
                  mergeTargetProductId:
                    e.target.value === "merge"
                      ? resolved.mergeTargetProductId ?? line.matchedProduct?.id
                      : undefined,
                })
              }
            >
              <option value="merge">Use existing product</option>
              <option value="create">Create new product</option>
            </select>

            {resolved.action === "merge" ? (
              <select
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                value={resolved.mergeTargetProductId ?? ""}
                onChange={(e) => onUpdate({ mergeTargetProductId: e.target.value })}
              >
                <option value="">Select product…</option>
                {suggestions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {productLabel(product)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <select
                  className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={brandId}
                  onChange={(e) => onUpdate({ createBrandId: e.target.value })}
                >
                  <option value="">Use default brand…</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-emerald-800">
                  Will create &quot;{line.productName}&quot;
                  {brandName ? ` under ${brandName}` : defaultBrandId ? "" : " — pick a brand"}
                </p>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function SalesImportResultSummary({
  result,
  sourceFileName,
}: {
  result: SalesImportResult;
  sourceFileName?: string;
}) {
  const failed = result.rows.filter((row) => row.status === "FAILED");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-zinc-900">Import result</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Warehouse: {result.warehouse.name} ({result.warehouse.code})
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="text-emerald-700">Succeeded: {result.successCount}</span>
        <span className="text-red-700">Failed: {result.failedCount}</span>
        {result.createdProductCount ? (
          <span className="text-indigo-700">
            New products: {result.createdProductCount}
          </span>
        ) : null}
        <span>Invoices: {result.totalVouchers}</span>
      </div>

      {result.vouchers.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-1">Invoice</th>
                <th className="px-2 py-1">Client</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Details</th>
              </tr>
            </thead>
            <tbody>
              {result.vouchers.map((voucher) => (
                <tr key={voucher.voucherIndex} className="border-t border-zinc-100">
                  <td className="px-2 py-2">{voucher.invoiceNumber}</td>
                  <td className="px-2 py-2">{voucher.clientName}</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        voucher.status === "SUCCESS"
                          ? "text-emerald-700"
                          : voucher.status === "PARTIAL"
                            ? "text-amber-700"
                            : "text-red-700"
                      }
                    >
                      {voucher.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-zinc-600">
                    {voucher.message ??
                      (voucher.movementCount != null
                        ? `${voucher.movementCount} movement(s)`
                        : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadFailedSalesImportExcel(result, sourceFileName)}
          >
            Download failed rows (.xlsx)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
