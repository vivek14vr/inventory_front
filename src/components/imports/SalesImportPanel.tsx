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
  SalesImportExistingClient,
  SalesImportExistingProduct,
  SalesImportLinePreview,
  SalesImportPreview,
  SalesImportResult,
  SalesImportVoucherPreview,
} from "@/types/imports";

type VoucherActionState = {
  clientName: string;
  clientSecondaryName: string;
  invoiceNumber: string;
  sellDate: string;
  clientAction: "merge" | "create";
  mergeTargetClientId?: string;
};

type LineActionState = {
  productName: string;
  quantity: string;
  brandName: string;
  brandAction: "merge" | "create";
  mergeTargetBrandId?: string;
  action: "merge" | "create";
  mergeTargetProductId?: string;
};

function initVoucherActions(preview: SalesImportPreview): Record<number, VoucherActionState> {
  const states: Record<number, VoucherActionState> = {};
  for (const voucher of preview.vouchers) {
    states[voucher.voucherIndex] = {
      clientName: voucher.clientName,
      clientSecondaryName: voucher.matchedClient?.secondaryName ?? "",
      invoiceNumber: voucher.invoiceNumber,
      sellDate: voucher.sellDate,
      clientAction: voucher.clientCategory === "matched" ? "merge" : "create",
      mergeTargetClientId: voucher.matchedClient?.id,
    };
  }
  return states;
}

function initLineActions(preview: SalesImportPreview): Record<number, LineActionState> {
  const states: Record<number, LineActionState> = {};
  for (const voucher of preview.vouchers) {
    for (const line of voucher.lines) {
      if (line.errors.length > 0) continue;
      states[line.rowNumber] = {
        productName: line.productName,
        quantity: String(line.quantity),
        brandName: line.brandName,
        brandAction: line.brandCategory === "matched" ? "merge" : "create",
        mergeTargetBrandId: line.matchedBrand?.id,
        action: line.matchedProduct ? "merge" : "create",
        mergeTargetProductId: line.matchedProduct?.id,
      };
    }
  }
  return states;
}

function resolvedVoucherAction(
  voucher: SalesImportVoucherPreview,
  state?: VoucherActionState
): VoucherActionState {
  return {
    clientName: state?.clientName ?? voucher.clientName,
    clientSecondaryName: state?.clientSecondaryName ?? voucher.matchedClient?.secondaryName ?? "",
    invoiceNumber: state?.invoiceNumber ?? voucher.invoiceNumber,
    sellDate: state?.sellDate ?? voucher.sellDate,
    clientAction: state?.clientAction ?? (voucher.clientCategory === "matched" ? "merge" : "create"),
    mergeTargetClientId: state?.mergeTargetClientId ?? voucher.matchedClient?.id,
  };
}

function resolvedLineAction(
  line: SalesImportLinePreview,
  state?: LineActionState
): LineActionState {
  return {
    productName: state?.productName ?? line.productName,
    quantity: state?.quantity ?? String(line.quantity),
    brandName: state?.brandName ?? line.brandName,
    brandAction: state?.brandAction ?? (line.brandCategory === "matched" ? "merge" : "create"),
    mergeTargetBrandId: state?.mergeTargetBrandId ?? line.matchedBrand?.id,
    action: state?.action ?? (line.matchedProduct ? "merge" : "create"),
    mergeTargetProductId: state?.mergeTargetProductId ?? line.matchedProduct?.id,
  };
}

function productsForBrand(
  products: SalesImportExistingProduct[],
  brandId: string | undefined
) {
  if (!brandId) return products;
  return products.filter((product) => product.brandId === brandId);
}

function mergeProductIdForBrand(
  products: SalesImportExistingProduct[],
  brandId: string | undefined,
  preferredProductId?: string
): string | undefined {
  const brandProducts = productsForBrand(products, brandId);
  if (preferredProductId && brandProducts.some((p) => p.id === preferredProductId)) {
    return preferredProductId;
  }
  return brandProducts[0]?.id;
}

function suggestProducts(
  products: SalesImportExistingProduct[],
  label: string,
  brandId?: string,
  limit = 12
): SalesImportExistingProduct[] {
  const pool = brandId ? productsForBrand(products, brandId) : products;
  const needle = label.trim().toLowerCase();
  if (!needle) return pool.slice(0, limit);

  const scored = pool
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

  return scored.length > 0 ? scored : pool.slice(0, limit);
}

function suggestClients(
  clients: SalesImportExistingClient[],
  label: string,
  limit = 12
): SalesImportExistingClient[] {
  const needle = label.trim().toLowerCase();
  if (!needle) return clients.slice(0, limit);

  const scored = clients
    .map((client) => {
      const labels = [client.name, client.secondaryName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().toLowerCase());
      let score = 0;
      for (const candidate of labels) {
        if (candidate === needle) score = 100;
        else if (candidate.includes(needle) || needle.includes(candidate)) score = Math.max(score, 70);
      }
      return { client, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.client);

  return scored.length > 0 ? scored : clients.slice(0, limit);
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
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [voucherActions, setVoucherActions] = useState<Record<number, VoucherActionState>>({});
  const [lineActions, setLineActions] = useState<Record<number, LineActionState>>({});
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allLinesReady = useMemo(() => {
    if (!preview || !warehouseId) return false;

    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
      if (!voucherState.clientName.trim()) return false;
      if (!voucherState.invoiceNumber.trim()) return false;
      if (voucherState.clientAction === "merge" && !voucherState.mergeTargetClientId) {
        return false;
      }

      for (const line of voucher.lines) {
        if (line.errors.length > 0) continue;
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        const qty = Number.parseInt(state.quantity, 10);
        if (!Number.isFinite(qty) || qty < 1) return false;
        if (!state.productName.trim()) return false;
        if (!state.brandName.trim()) return false;
        if (state.brandAction === "merge" && !state.mergeTargetBrandId) return false;
        if (state.action === "merge" && !state.mergeTargetProductId) return false;
      }
    }

    const importableLines = preview.vouchers.flatMap((voucher) =>
      voucher.lines.filter((line) => line.errors.length === 0)
    );
    return importableLines.length > 0;
  }, [preview, voucherActions, lineActions, warehouseId]);

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
      setVoucherActions(initVoucherActions(data));
      setLineActions(initLineActions(data));
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Failed to read Excel file");
    } finally {
      setLoading(false);
    }
  }

  function updateVoucherAction(voucherIndex: number, patch: Partial<VoucherActionState>) {
    setVoucherActions((prev) => ({
      ...prev,
      [voucherIndex]: { ...prev[voucherIndex], ...patch },
    }));
  }

  function updateLineAction(rowNumber: number, patch: Partial<LineActionState>) {
    setLineActions((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], ...patch },
    }));
  }

  async function handleConfirm() {
    if (!preview || !warehouseId) return;

    const validationErrors: string[] = [];
    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
      if (!voucherState.clientName.trim()) {
        validationErrors.push(`Invoice ${voucher.invoiceNumber || voucher.voucherIndex}: client name required`);
      }
      if (!voucherState.invoiceNumber.trim()) {
        validationErrors.push(`Invoice ${voucher.voucherIndex}: invoice number required`);
      }
      if (voucherState.clientAction === "merge" && !voucherState.mergeTargetClientId) {
        validationErrors.push(`Invoice ${voucher.invoiceNumber || voucher.voucherIndex}: select a client`);
      }

      for (const line of voucher.lines.filter((item) => item.errors.length === 0)) {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        const qty = Number.parseInt(state.quantity, 10);
        if (!state.productName.trim()) {
          validationErrors.push(`Row ${line.rowNumber}: product name required`);
        }
        if (!state.brandName.trim()) {
          validationErrors.push(`Row ${line.rowNumber}: brand name required`);
        }
        if (!Number.isFinite(qty) || qty < 1) {
          validationErrors.push(`Row ${line.rowNumber}: quantity must be at least 1`);
        }
        if (state.brandAction === "merge" && !state.mergeTargetBrandId) {
          validationErrors.push(`Row ${line.rowNumber}: select a brand to merge into`);
        }
        if (state.action === "merge" && !state.mergeTargetProductId) {
          validationErrors.push(`Row ${line.rowNumber}: select a product to merge into`);
        }
      }
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.slice(0, 5).join(" · "));
      return;
    }

    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      const vouchers = preview.vouchers
        .map((voucher) => {
          const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
          return {
            voucherIndex: voucher.voucherIndex,
            headerRowNumber: voucher.headerRowNumber,
            sellDate: voucherState.sellDate,
            clientName: voucherState.clientName.trim(),
            clientSecondaryName: voucherState.clientSecondaryName.trim() || undefined,
            invoiceNumber: voucherState.invoiceNumber.trim(),
            clientAction: voucherState.clientAction,
            mergeTargetClientId:
              voucherState.clientAction === "merge"
                ? voucherState.mergeTargetClientId
                : undefined,
            lines: voucher.lines
              .filter((line) => line.errors.length === 0)
              .map((line) => {
                const state = resolvedLineAction(line, lineActions[line.rowNumber]);
                const brandId =
                  state.brandAction === "merge" ? state.mergeTargetBrandId : undefined;
                const mergeTargetProductId =
                  state.action === "merge"
                    ? mergeProductIdForBrand(
                        preview.existingProducts,
                        brandId,
                        state.mergeTargetProductId
                      )
                    : undefined;
                return {
                  rowNumber: line.rowNumber,
                  productName: state.productName.trim(),
                  brandName: state.brandName.trim(),
                  quantity: Number.parseInt(state.quantity, 10),
                  brandAction: state.brandAction,
                  mergeTargetBrandId: brandId,
                  action: state.action,
                  mergeTargetProductId,
                };
              })
              .filter(
                (line) =>
                  (line.brandAction === "merge" ? line.mergeTargetBrandId : line.brandName) &&
                  (line.action === "merge" ? line.mergeTargetProductId : true)
              ),
          };
        })
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
            ? `, ${importResult.createdProductCount} new product(s)`
            : "") +
          (importResult.createdBrandCount
            ? `, ${importResult.createdBrandCount} new brand(s)`
            : "") +
          (importResult.createdClientCount
            ? `, ${importResult.createdClientCount} new client(s)`
            : "") +
          ` across ${importResult.totalVouchers} invoice(s)`
      );
      setPreview(null);
      setVoucherActions({});
      setLineActions({});
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
    setVoucherActions({});
    setLineActions({});
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Direct sell / stock out import</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload a Tally sales register Excel. After preview you can edit invoice details and choose
          whether to merge or create clients, brands, and products before importing.
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
            </tbody>
          </table>
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
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <WarehouseSelect
              value={warehouseId}
              onChange={setWarehouseId}
              label="Stock out from warehouse"
            />
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
            <span>Invoices: {preview.totalVouchers}</span>
            <span>Product lines: {preview.totalLines}</span>
            <span className="text-indigo-700">Matched products: {preview.matchedCount}</span>
            <span className="text-amber-700">Unmatched products: {preview.unmatchedCount}</span>
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
              clients={preview.existingClients}
              voucherState={voucherActions[voucher.voucherIndex]}
              lineActions={lineActions}
              onUpdateVoucher={(patch) => updateVoucherAction(voucher.voucherIndex, patch)}
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
  clients,
  voucherState,
  lineActions,
  onUpdateVoucher,
  onUpdateLine,
}: {
  voucher: SalesImportVoucherPreview;
  products: SalesImportExistingProduct[];
  brands: SalesImportExistingBrand[];
  clients: SalesImportExistingClient[];
  voucherState?: VoucherActionState;
  lineActions: Record<number, LineActionState>;
  onUpdateVoucher: (patch: Partial<VoucherActionState>) => void;
  onUpdateLine: (rowNumber: number, patch: Partial<LineActionState>) => void;
}) {
  const resolved = resolvedVoucherAction(voucher, voucherState);
  const clientSuggestions = useMemo(
    () => suggestClients(clients, resolved.clientName),
    [clients, resolved.clientName]
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-zinc-900">Invoice preview</h3>
          <span className="text-xs text-zinc-400">Header row {voucher.headerRowNumber}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Client name</span>
            <input
              className="form-input mt-1 w-full"
              value={resolved.clientName}
              onChange={(e) => onUpdateVoucher({ clientName: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Invoice number</span>
            <input
              className="form-input mt-1 w-full"
              value={resolved.invoiceNumber}
              onChange={(e) => onUpdateVoucher({ invoiceNumber: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Sell date</span>
            <input
              className="form-input mt-1 w-full"
              value={resolved.sellDate}
              onChange={(e) => onUpdateVoucher({ sellDate: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Client secondary name</span>
            <input
              className="form-input mt-1 w-full"
              value={resolved.clientSecondaryName}
              onChange={(e) => onUpdateVoucher({ clientSecondaryName: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:max-w-md">
          <span className="text-sm font-medium text-zinc-700">Client action</span>
          <select
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            value={resolved.clientAction}
            onChange={(e) =>
              onUpdateVoucher({
                clientAction: e.target.value as "merge" | "create",
                mergeTargetClientId:
                  e.target.value === "merge"
                    ? resolved.mergeTargetClientId ?? voucher.matchedClient?.id
                    : undefined,
              })
            }
          >
            <option value="merge">Use existing client</option>
            <option value="create">Create new client</option>
          </select>
          {resolved.clientAction === "merge" ? (
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={resolved.mergeTargetClientId ?? ""}
              onChange={(e) => onUpdateVoucher({ mergeTargetClientId: e.target.value })}
            >
              <option value="">Select client…</option>
              {clientSuggestions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.secondaryName ? ` (${client.secondaryName})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-emerald-800">
              Will create client &quot;{resolved.clientName.trim() || "—"}&quot;
            </p>
          )}
          {voucher.clientCategory === "matched" && voucher.matchedClient ? (
            <p className="text-xs text-indigo-700">
              File matched: {voucher.matchedClient.name}
            </p>
          ) : (
            <p className="text-xs text-amber-700">No exact client match in file</p>
          )}
        </div>

        {voucher.errors.length > 0 ? (
          <p className="text-sm text-red-700">{voucher.errors.join("; ")}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-white text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Brand</th>
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
                state={lineActions[line.rowNumber]}
                onUpdate={(patch) => onUpdateLine(line.rowNumber, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineReviewRow({
  line,
  products,
  brands,
  state,
  onUpdate,
}: {
  line: SalesImportLinePreview;
  products: SalesImportExistingProduct[];
  brands: SalesImportExistingBrand[];
  state?: LineActionState;
  onUpdate: (patch: Partial<LineActionState>) => void;
}) {
  const resolved = resolvedLineAction(line, state);
  const brandId =
    resolved.brandAction === "merge" ? resolved.mergeTargetBrandId : undefined;
  const suggestions = useMemo(
    () => suggestProducts(products, resolved.productName, brandId),
    [products, resolved.productName, brandId]
  );
  const hasErrors = line.errors.length > 0;

  return (
    <tr className={`border-t border-zinc-100 ${hasErrors ? "bg-red-50/40" : ""}`}>
      <td className="px-3 py-2 text-zinc-500 align-top">{line.rowNumber}</td>
      <td className="px-3 py-2 align-top">
        <input
          className="form-input w-full min-w-[12rem]"
          value={resolved.productName}
          onChange={(e) => onUpdate({ productName: e.target.value })}
          disabled={hasErrors}
        />
        {line.category === "matched" && line.matchedProduct ? (
          <p className="mt-1 text-xs text-indigo-700">
            Matched: {line.matchedProduct.name} ({line.matchedProduct.brandName})
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-700">No exact product match</p>
        )}
        {hasErrors ? (
          <div className="mt-1 text-xs text-red-700">{line.errors.join("; ")}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="number"
          min={1}
          step={1}
          className="form-input w-24 tabular-nums"
          value={resolved.quantity}
          onChange={(e) => onUpdate({ quantity: e.target.value })}
          disabled={hasErrors}
        />
      </td>
      <td className="px-3 py-2 align-top">
        {hasErrors ? (
          <span className="text-xs text-zinc-500">Fix row errors first</span>
        ) : (
          <div className="flex min-w-[240px] flex-col gap-2">
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={resolved.brandAction}
              onChange={(e) =>
                onUpdate({
                  brandAction: e.target.value as "merge" | "create",
                  mergeTargetBrandId:
                    e.target.value === "merge"
                      ? resolved.mergeTargetBrandId ?? line.matchedBrand?.id
                      : undefined,
                })
              }
            >
              <option value="merge">Use existing brand</option>
              <option value="create">Create new brand</option>
            </select>
            {resolved.brandAction === "merge" ? (
              <select
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                value={resolved.mergeTargetBrandId ?? ""}
                onChange={(e) => {
                  const nextBrandId = e.target.value;
                  const nextBrand = brands.find((brand) => brand.id === nextBrandId);
                  onUpdate({
                    mergeTargetBrandId: nextBrandId,
                    brandName: nextBrand?.name ?? resolved.brandName,
                    mergeTargetProductId: mergeProductIdForBrand(
                      products,
                      nextBrandId,
                      resolved.mergeTargetProductId
                    ),
                  });
                }}
              >
                <option value="">Select brand…</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="form-input w-full"
                value={resolved.brandName}
                onChange={(e) => onUpdate({ brandName: e.target.value })}
                placeholder="New brand name"
              />
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {hasErrors ? null : (
          <div className="flex min-w-[280px] flex-col gap-2">
            <select
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={resolved.action}
              onChange={(e) =>
                onUpdate({
                  action: e.target.value as "merge" | "create",
                  mergeTargetProductId:
                    e.target.value === "merge"
                      ? mergeProductIdForBrand(
                          products,
                          brandId,
                          resolved.mergeTargetProductId ?? line.matchedProduct?.id
                        )
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
              <p className="text-xs text-emerald-800">
                Will create &quot;{resolved.productName.trim() || "—"}&quot;
                {resolved.brandAction === "merge" && brandId
                  ? ` under ${brands.find((b) => b.id === brandId)?.name ?? "selected brand"}`
                  : resolved.brandName.trim()
                    ? ` under new brand ${resolved.brandName.trim()}`
                    : ""}
              </p>
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
          <span className="text-indigo-700">New products: {result.createdProductCount}</span>
        ) : null}
        {result.createdBrandCount ? (
          <span className="text-indigo-700">New brands: {result.createdBrandCount}</span>
        ) : null}
        {result.createdClientCount ? (
          <span className="text-indigo-700">New clients: {result.createdClientCount}</span>
        ) : null}
        <span>Invoices: {result.totalVouchers}</span>
      </div>

      {result.vouchers.length > 0 ? (
        <div className="mt-4 space-y-4">
          {result.vouchers.map((voucher) => {
            const voucherRows = result.rows.filter(
              (row) => row.voucherIndex === voucher.voucherIndex
            );
            const failedRows = voucherRows.filter((row) => row.status === "FAILED");

            return (
              <div
                key={voucher.voucherIndex}
                className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-zinc-900">
                    Invoice {voucher.invoiceNumber}
                  </span>
                  <span className="text-sm text-zinc-600">{voucher.clientName}</span>
                  <span
                    className={
                      voucher.status === "SUCCESS"
                        ? "text-sm font-medium text-emerald-700"
                        : "text-sm font-medium text-red-700"
                    }
                  >
                    {voucher.status}
                  </span>
                </div>
                {voucher.message ? (
                  <p className="mt-2 text-sm text-red-700">{voucher.message}</p>
                ) : null}
                {failedRows.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                    {failedRows.map((row) => (
                      <li key={row.rowNumber}>
                        <span className="font-medium">Row {row.rowNumber}</span>
                        {row.productName ? ` · ${row.productName}` : null}
                        {row.message ? (
                          <span className="text-red-700"> — {row.message}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : voucher.status === "SUCCESS" ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    {voucher.movementCount != null
                      ? `${voucher.movementCount} stock-out line(s) recorded`
                      : "Stock out recorded"}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {result.rows.some((row) => row.status === "SUCCESS") ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-1">Invoice</th>
                <th className="px-2 py-1">Client</th>
                <th className="px-2 py-1">Product</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.rows
                .filter((row) => row.status === "SUCCESS")
                .map((row) => (
                  <tr key={`${row.voucherIndex}-${row.rowNumber}`} className="border-t border-zinc-100">
                    <td className="px-2 py-2">{row.invoiceNumber}</td>
                    <td className="px-2 py-2">{row.clientName}</td>
                    <td className="px-2 py-2">{row.productName}</td>
                    <td className="px-2 py-2 text-emerald-700">{row.status}</td>
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
