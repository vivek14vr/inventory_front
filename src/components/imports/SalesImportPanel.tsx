"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  ImportExampleCard,
  ImportPreviewStats,
  ImportTip,
  ImportUploadForm,
} from "@/components/imports/ImportUploadForm";
import { downloadSalesImportReport } from "@/lib/imports/exportSalesImportReport";
import { formatSecondaryName } from "@/lib/products/productNames";
import type {
  SalesImportConfirmVoucher,
  SalesImportExistingBrand,
  SalesImportExistingClient,
  SalesImportExistingProduct,
  SalesImportLinePreview,
  SalesImportPreview,
  SalesImportResult,
  SalesImportVoucherPreview,
} from "@/types/imports";

/**
 * Invoices per confirm request. Sized for small production hosts and files
 * up to ~200 invoices (≈40 sequential batches).
 */
const SALES_IMPORT_CONFIRM_BATCH_SIZE = 5;
/** Brief pause between batches so Node can reclaim memory before the next confirm. */
const SALES_IMPORT_CONFIRM_BATCH_PAUSE_MS = 200;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size < 1) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function mergeWarehouseList(
  lists: Array<Array<{ id: string; name: string; code: string }> | undefined>
): Array<{ id: string; name: string; code: string }> {
  const byId = new Map<string, { id: string; name: string; code: string }>();
  for (const list of lists) {
    for (const warehouse of list ?? []) {
      byId.set(warehouse.id, warehouse);
    }
  }
  return [...byId.values()];
}

function mergeSalesImportResults(
  parts: SalesImportResult[],
  fileName?: string
): SalesImportResult {
  const warehouses = mergeWarehouseList([
    ...parts.map((part) => part.warehouses),
    ...parts.map((part) => [part.warehouse]),
  ]);
  const startedTimes = parts
    .map((part) => part.startedAt)
    .filter((value): value is string => Boolean(value));
  const completedTimes = parts
    .map((part) => part.completedAt)
    .filter((value): value is string => Boolean(value));
  return {
    fileName: fileName ?? parts[0]?.fileName,
    warehouse: warehouses[0] ?? parts[0]!.warehouse,
    warehouses: warehouses.length > 0 ? warehouses : parts[0]?.warehouses,
    totalVouchers: parts.reduce((sum, part) => sum + part.totalVouchers, 0),
    totalLines: parts.reduce((sum, part) => sum + part.totalLines, 0),
    successCount: parts.reduce((sum, part) => sum + part.successCount, 0),
    failedCount: parts.reduce((sum, part) => sum + part.failedCount, 0),
    createdProductCount: parts.reduce(
      (sum, part) => sum + (part.createdProductCount ?? 0),
      0
    ),
    createdBrandCount: parts.reduce(
      (sum, part) => sum + (part.createdBrandCount ?? 0),
      0
    ),
    createdClientCount: parts.reduce(
      (sum, part) => sum + (part.createdClientCount ?? 0),
      0
    ),
    startedAt: startedTimes.sort()[0],
    completedAt: completedTimes.sort().at(-1),
    durationMs: parts.reduce((sum, part) => sum + (part.durationMs ?? 0), 0),
    batchCount: parts.length,
    vouchers: parts.flatMap((part) => part.vouchers),
    rows: parts.flatMap((part) => part.rows),
  };
}

function withImportTiming(
  result: SalesImportResult,
  startedAtMs: number,
  batchCount: number
): SalesImportResult {
  const completedAtMs = Date.now();
  return {
    ...result,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    batchCount,
  };
}

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
  ignore: boolean;
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
      states[line.rowNumber] = {
        productName: line.productName,
        quantity: String(line.quantity),
        brandName: line.brandName,
        brandAction: line.brandCategory === "matched" ? "merge" : "create",
        mergeTargetBrandId: line.matchedBrand?.id,
        action: line.matchedProduct ? "merge" : "create",
        mergeTargetProductId: line.matchedProduct?.id,
        ignore: false,
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
    ignore: state?.ignore ?? false,
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
  if (!preferredProductId) return undefined;
  const brandProducts = productsForBrand(products, brandId);
  if (brandProducts.some((p) => p.id === preferredProductId)) {
    return preferredProductId;
  }
  return undefined;
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff]+/g, "");
}

function suggestProducts(
  products: SalesImportExistingProduct[],
  label: string,
  brandId?: string,
  limit = 12
): SalesImportExistingProduct[] {
  const pool = brandId ? productsForBrand(products, brandId) : products;
  const needle = normalizeLookupKey(label);
  if (!needle) return pool.slice(0, limit);

  const scored = pool
    .map((product) => {
      const labels = [product.name, product.secondaryName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => normalizeLookupKey(value));

      let score = 0;
      for (const candidate of labels) {
        if (candidate === needle) score = Math.max(score, 100);
        else if (candidate.includes(needle) || needle.includes(candidate)) score = Math.max(score, 70);
        else {
          const tokens = label
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter((token) => token.length > 2)
            .map((token) => normalizeLookupKey(token));
          const overlap = tokens.filter((token) => token && candidate.includes(token)).length;
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
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [voucherActions, setVoucherActions] = useState<Record<number, VoucherActionState>>({});
  const [lineActions, setLineActions] = useState<Record<number, LineActionState>>({});
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState<{
    current: number;
    total: number;
    invoicesDone: number;
    invoicesTotal: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allLinesReady = useMemo(() => {
    if (!preview) return false;

    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
      if (!voucherState.clientName.trim()) return false;
      if (!voucherState.invoiceNumber.trim()) return false;
      if (voucherState.clientAction === "merge" && !voucherState.mergeTargetClientId) {
        return false;
      }

      for (const line of voucher.lines) {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        if (state.ignore) continue;
        if (line.errors.length > 0) return false;
        if (!line.warehouseId) return false;
        const qty = Number.parseInt(state.quantity, 10);
        if (!Number.isFinite(qty) || qty < 1) return false;
        if (!state.productName.trim()) return false;
        if (!state.brandName.trim()) return false;
        if (state.brandAction === "merge" && !state.mergeTargetBrandId) return false;
        if (state.action === "merge" && !state.mergeTargetProductId) return false;
      }
    }

    const importableLines = preview.vouchers.flatMap((voucher) =>
      voucher.lines.filter((line) => {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        return !state.ignore && line.errors.length === 0 && Boolean(line.warehouseId);
      })
    );
    return importableLines.length > 0;
  }, [preview, voucherActions, lineActions]);

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
    if (!preview) return;

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

      for (const line of voucher.lines) {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        if (state.ignore) continue;
        if (line.errors.length > 0) {
          validationErrors.push(`Row ${line.rowNumber}: fix errors or ignore this line`);
          continue;
        }
        if (!line.warehouseId) {
          validationErrors.push(`Row ${line.rowNumber}: warehouse could not be resolved from invoice Narration`);
          continue;
        }
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
    setConfirmProgress(null);
    setError("");
    setSuccess("");
    const importStartedAtMs = Date.now();
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
              .map((line) => {
                const state = resolvedLineAction(line, lineActions[line.rowNumber]);
                if (state.ignore || line.errors.length > 0 || !line.warehouseId) {
                  return null;
                }
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
                  warehouseId: line.warehouseId,
                  brandAction: state.brandAction,
                  mergeTargetBrandId: brandId,
                  action: state.action,
                  mergeTargetProductId,
                };
              })
              .filter(
                (
                  line
                ): line is NonNullable<typeof line> =>
                  Boolean(
                    line &&
                      (line.brandAction === "merge" ? line.mergeTargetBrandId : line.brandName) &&
                      (line.action === "merge" ? line.mergeTargetProductId : true)
                  )
              ),
          };
        })
        .filter((voucher) => voucher.lines.length > 0);

      if (vouchers.length === 0) {
        setError("No product lines left to import (all ignored or invalid)");
        return;
      }

      const batches = chunkArray(vouchers, SALES_IMPORT_CONFIRM_BATCH_SIZE);
      const batchResults: SalesImportResult[] = [];
      const invoicesTotal = vouchers.length;
      let invoicesDone = 0;
      setConfirmProgress({
        current: 0,
        total: batches.length,
        invoicesDone: 0,
        invoicesTotal,
      });

      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index]!;
        setConfirmProgress({
          current: index + 1,
          total: batches.length,
          invoicesDone,
          invoicesTotal,
        });
        try {
          const batchResult = await api.imports.confirmSales({
            fileName: file?.name,
            vouchers: batch as SalesImportConfirmVoucher[],
          });
          batchResults.push(batchResult);
          invoicesDone += batch.length;
          setConfirmProgress({
            current: index + 1,
            total: batches.length,
            invoicesDone,
            invoicesTotal,
          });
          if (index < batches.length - 1 && SALES_IMPORT_CONFIRM_BATCH_PAUSE_MS > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, SALES_IMPORT_CONFIRM_BATCH_PAUSE_MS)
            );
          }
        } catch (err) {
          if (batchResults.length > 0) {
            const partial = withImportTiming(
              mergeSalesImportResults(batchResults, file?.name),
              importStartedAtMs,
              batchResults.length
            );
            setResult(partial);
            setPreview(null);
            setVoucherActions({});
            setLineActions({});
            if (fileInputRef.current) fileInputRef.current.value = "";
            setFile(null);
            const remaining = invoicesTotal - invoicesDone;
            setError(
              `Stopped after ${invoicesDone} of ${invoicesTotal} invoice(s) (batch ${index + 1}/${batches.length}): ${
                err instanceof ApiError ? err.message : "Import failed"
              }. ${partial.successCount} line(s) were saved. Re-upload the file and skip the ${invoicesDone} already-imported invoice(s), then confirm the remaining ${remaining}.`
            );
            setSuccess(
              `Partial import: ${partial.successCount} line(s) succeeded across ${invoicesDone} invoice(s); ${partial.failedCount} failed before the interruption.`
            );
            return;
          }
          throw err;
        }
      }

      const importResult = withImportTiming(
        mergeSalesImportResults(batchResults, file?.name),
        importStartedAtMs,
        batches.length
      );
      setResult(importResult);
      const warehouseLabel =
        importResult.warehouses && importResult.warehouses.length > 1
          ? importResult.warehouses.map((w) => w.name).join(", ")
          : importResult.warehouse.name;
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
          ` across ${importResult.totalVouchers} invoice(s) at ${warehouseLabel}` +
          (batches.length > 1 ? ` · ${batches.length} batches` : "")
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
      setConfirmProgress(null);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setVoucherActions({});
    setLineActions({});
    setConfirmProgress(null);
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <ImportUploadForm
        title="Direct sell / stock out"
        description="Upload a Tally sales register. After preview you can edit invoice details and choose whether to merge or create clients, brands, and products."
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
            Warehouse is taken from Narration on the invoice/client row: empty →
            Goregaon, contains &quot;vasai&quot; → Vasai. Each invoice uses one
            warehouse for all its product lines. Large files (up to ~200 invoices)
            confirm in batches of {SALES_IMPORT_CONFIRM_BATCH_SIZE} automatically.
            Use Skip on a line to ignore it.
          </ImportTip>
        }
        example={
          <ImportExampleCard
            title="Column layout"
            footnote="Header row is detected automatically. Narration on the dated invoice row chooses warehouse; Quantity is usually in G. Older sheets without Narration default every invoice to Goregaon."
          >
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-white text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-2.5">A — Date</th>
                  <th className="px-3 py-2.5">B — Particulars</th>
                  <th className="px-3 py-2.5">E — Voucher no.</th>
                  <th className="px-3 py-2.5">F — Narration</th>
                  <th className="px-3 py-2.5">G — Quantity</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-stone-100 bg-white/70 text-stone-800">
                  <td className="px-3 py-2.5">01-Jul-26</td>
                  <td className="px-3 py-2.5 font-medium">Sandhya (client)</td>
                  <td className="px-3 py-2.5">1748</td>
                  <td className="px-3 py-2.5">vasai</td>
                  <td className="px-3 py-2.5 text-stone-400">ignore</td>
                </tr>
                <tr className="border-t border-stone-100 bg-white/70 text-stone-800">
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5">1000ml Rectangle Container (DP)</td>
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5 tabular-nums">1000</td>
                </tr>
                <tr className="border-t border-stone-100 bg-white/70 text-stone-800">
                  <td className="px-3 py-2.5">02-Jul-26</td>
                  <td className="px-3 py-2.5 font-medium">Other client</td>
                  <td className="px-3 py-2.5">1749</td>
                  <td className="px-3 py-2.5 text-stone-400">(empty → Goregaon)</td>
                  <td className="px-3 py-2.5 text-stone-400">ignore</td>
                </tr>
                <tr className="border-t border-stone-100 bg-white/70 text-stone-800">
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5">7 inch plate</td>
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5 text-stone-400">—</td>
                  <td className="px-3 py-2.5 tabular-nums">400</td>
                </tr>
              </tbody>
            </table>
          </ImportExampleCard>
        }
      />

      <Alert message={error} />
      <Alert message={success} type="success" />

      {preview && (
        <SalesImportPreviewReview
          preview={preview}
          voucherActions={voucherActions}
          lineActions={lineActions}
          confirming={confirming}
          confirmProgress={confirmProgress}
          allLinesReady={allLinesReady}
          onUpdateVoucher={updateVoucherAction}
          onUpdateLine={updateLineAction}
          onConfirm={() => void handleConfirm()}
        />
      )}

      {result && <SalesImportResultSummary result={result} sourceFileName={result.fileName} />}
    </div>
  );
}

type PreviewFilter = "all" | "needs_review" | "ready";

function lineNeedsReview(
  line: SalesImportLinePreview,
  state: LineActionState
): boolean {
  if (state.ignore) return false;
  if (line.errors.length > 0) return true;
  if (!line.warehouseId) return true;
  if (line.category === "unmatched") return true;
  if (state.brandAction === "merge" && !state.mergeTargetBrandId) return true;
  if (state.action === "merge" && !state.mergeTargetProductId) return true;
  return false;
}

function SalesImportPreviewReview({
  preview,
  voucherActions,
  lineActions,
  confirming,
  confirmProgress,
  allLinesReady,
  onUpdateVoucher,
  onUpdateLine,
  onConfirm,
}: {
  preview: SalesImportPreview;
  voucherActions: Record<number, VoucherActionState>;
  lineActions: Record<number, LineActionState>;
  confirming: boolean;
  confirmProgress: {
    current: number;
    total: number;
    invoicesDone: number;
    invoicesTotal: number;
  } | null;
  allLinesReady: boolean;
  onUpdateVoucher: (voucherIndex: number, patch: Partial<VoucherActionState>) => void;
  onUpdateLine: (rowNumber: number, patch: Partial<LineActionState>) => void;
  onConfirm: () => void;
}) {
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const needsReviewCount = useMemo(() => {
    let count = 0;
    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(
        voucher,
        voucherActions[voucher.voucherIndex]
      );
      if (
        !voucherState.clientName.trim() ||
        !voucherState.invoiceNumber.trim() ||
        (voucherState.clientAction === "merge" && !voucherState.mergeTargetClientId) ||
        voucher.errors.length > 0 ||
        voucher.clientCategory === "new"
      ) {
        count += 1;
        continue;
      }
      const lineIssue = voucher.lines.some((line) =>
        lineNeedsReview(line, resolvedLineAction(line, lineActions[line.rowNumber]))
      );
      if (lineIssue) count += 1;
    }
    return count;
  }, [preview, voucherActions, lineActions]);

  const importableCount = useMemo(() => {
    return preview.vouchers.reduce((sum, voucher) => {
      return (
        sum +
        voucher.lines.filter((line) => {
          const state = resolvedLineAction(line, lineActions[line.rowNumber]);
          return !state.ignore && line.errors.length === 0 && Boolean(line.warehouseId);
        }).length
      );
    }, 0);
  }, [preview, lineActions]);

  const filteredVouchers = useMemo(() => {
    if (filter === "all") return preview.vouchers;
    return preview.vouchers.filter((voucher) => {
      const voucherState = resolvedVoucherAction(
        voucher,
        voucherActions[voucher.voucherIndex]
      );
      const voucherIssue =
        voucher.errors.length > 0 ||
        voucher.clientCategory === "new" ||
        !voucherState.clientName.trim() ||
        !voucherState.invoiceNumber.trim() ||
        (voucherState.clientAction === "merge" && !voucherState.mergeTargetClientId);
      const lineIssue = voucher.lines.some((line) =>
        lineNeedsReview(line, resolvedLineAction(line, lineActions[line.rowNumber]))
      );
      const needsReview = voucherIssue || lineIssue;
      return filter === "needs_review" ? needsReview : !needsReview;
    });
  }, [preview, filter, voucherActions, lineActions]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
            Step 2 · Review
          </p>
          <h3 className="mt-1 text-lg font-bold text-stone-900">Confirm stock out</h3>
          <p className="mt-1 text-sm text-stone-500">
            Warehouse comes from the invoice Narration. Skip lines you do not want to import.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-stone-200 bg-stone-50 p-1">
          {(
            [
              { id: "all", label: "All" },
              { id: "needs_review", label: `Needs review (${needsReviewCount})` },
              { id: "ready", label: "Ready" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                filter === item.id
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ImportPreviewStats
        items={[
          { label: "Invoices", value: preview.totalVouchers },
          { label: "Product lines", value: preview.totalLines },
          {
            label: "Matched",
            value: preview.matchedCount,
            tone: "info",
          },
          {
            label: "Unmatched",
            value: preview.unmatchedCount,
            tone: preview.unmatchedCount > 0 ? "warning" : "success",
          },
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

      {filteredVouchers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-500">
          No invoices in this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVouchers.map((voucher) => (
            <VoucherReviewCard
              key={voucher.voucherIndex}
              voucher={voucher}
              products={preview.existingProducts}
              brands={preview.existingBrands}
              clients={preview.existingClients}
              voucherState={voucherActions[voucher.voucherIndex]}
              lineActions={lineActions}
              collapsed={Boolean(collapsed[voucher.voucherIndex])}
              onToggleCollapsed={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [voucher.voucherIndex]: !prev[voucher.voucherIndex],
                }))
              }
              onUpdateVoucher={(patch) => onUpdateVoucher(voucher.voucherIndex, patch)}
              onUpdateLine={onUpdateLine}
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-4 z-10 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-lg shadow-stone-900/10 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-stone-600">
            <span className="font-semibold text-stone-900">{importableCount}</span> line
            {importableCount === 1 ? "" : "s"} ready
            {needsReviewCount > 0 ? (
              <span className="text-amber-700">
                {" "}
                · {needsReviewCount} invoice{needsReviewCount === 1 ? "" : "s"} still need review
              </span>
            ) : null}
            {confirming && confirmProgress && confirmProgress.invoicesTotal > 0 ? (
              <span className="block text-orange-700 sm:inline sm:before:content-['·_']">
                {confirmProgress.invoicesDone} of {confirmProgress.invoicesTotal}{" "}
                invoice{confirmProgress.invoicesTotal === 1 ? "" : "s"}
                {confirmProgress.total > 1
                  ? ` · batch ${confirmProgress.current}/${confirmProgress.total}`
                  : ""}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            size="lg"
            disabled={confirming || !allLinesReady}
            loading={confirming}
            onClick={onConfirm}
          >
            {confirming
              ? confirmProgress && confirmProgress.invoicesTotal > 1
                ? `Importing ${confirmProgress.invoicesDone}/${confirmProgress.invoicesTotal} invoices…`
                : "Importing…"
              : "Confirm stock out import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "matched" | "new" | "error" | "skip" | "neutral";
  children: ReactNode;
}) {
  const classes = {
    matched: "bg-sky-100 text-sky-800",
    new: "bg-amber-100 text-amber-900",
    error: "bg-red-100 text-red-800",
    skip: "bg-stone-100 text-stone-500",
    neutral: "bg-stone-100 text-stone-700",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function VoucherReviewCard({
  voucher,
  products,
  brands,
  clients,
  voucherState,
  lineActions,
  collapsed,
  onToggleCollapsed,
  onUpdateVoucher,
  onUpdateLine,
}: {
  voucher: SalesImportVoucherPreview;
  products: SalesImportExistingProduct[];
  brands: SalesImportExistingBrand[];
  clients: SalesImportExistingClient[];
  voucherState?: VoucherActionState;
  lineActions: Record<number, LineActionState>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onUpdateVoucher: (patch: Partial<VoucherActionState>) => void;
  onUpdateLine: (rowNumber: number, patch: Partial<LineActionState>) => void;
}) {
  const resolved = resolvedVoucherAction(voucher, voucherState);
  const clientSuggestions = useMemo(
    () => suggestClients(clients, resolved.clientName),
    [clients, resolved.clientName]
  );
  const activeLines = voucher.lines.filter(
    (line) => !resolvedLineAction(line, lineActions[line.rowNumber]).ignore
  ).length;
  const errorLines = voucher.lines.filter((line) => line.errors.length > 0).length;
  const unmatchedLines = voucher.lines.filter(
    (line) =>
      line.category === "unmatched" &&
      !resolvedLineAction(line, lineActions[line.rowNumber]).ignore
  ).length;
  const lineWarehouse = voucher.lines.find((line) => line.warehouseId || line.warehouseName);
  const warehouseId = voucher.warehouseId ?? lineWarehouse?.warehouseId;
  const warehouseLabel = voucher.warehouseName
    ? voucher.warehouseName
    : lineWarehouse?.warehouseName
      ? lineWarehouse.warehouseName
      : voucher.warehouseHint || lineWarehouse?.warehouseHint
        ? `${voucher.warehouseHint ?? lineWarehouse?.warehouseHint} missing`
        : "No warehouse";
  const warehouseOk = Boolean(warehouseId);

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-900/[0.03]">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left hover:bg-stone-50/80"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-stone-900">
              Invoice {resolved.invoiceNumber || "—"}
            </h3>
            <StatusPill tone={voucher.clientCategory === "matched" ? "matched" : "new"}>
              {voucher.clientCategory === "matched" ? "Client matched" : "New client"}
            </StatusPill>
            <StatusPill tone={warehouseOk ? "neutral" : "error"}>{warehouseLabel}</StatusPill>
            {errorLines > 0 ? (
              <StatusPill tone="error">{errorLines} error{errorLines === 1 ? "" : "s"}</StatusPill>
            ) : null}
            {unmatchedLines > 0 ? (
              <StatusPill tone="new">{unmatchedLines} unmatched</StatusPill>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-stone-500">
            {resolved.clientName || "No client"}
            {resolved.sellDate ? ` · ${resolved.sellDate}` : ""}
            {` · ${activeLines}/${voucher.lines.length} lines`}
            <span className="text-stone-400"> · row {voucher.headerRowNumber}</span>
          </p>
        </div>
        <span className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400">
          {collapsed ? "Expand" : "Collapse"}
        </span>
      </button>

      {!collapsed ? (
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-sm">
              <span className="font-medium text-stone-600">Client</span>
              <input
                className="form-input mt-1 w-full"
                value={resolved.clientName}
                onChange={(e) => onUpdateVoucher({ clientName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-600">Invoice #</span>
              <input
                className="form-input mt-1 w-full"
                value={resolved.invoiceNumber}
                onChange={(e) => onUpdateVoucher({ invoiceNumber: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-600">Sell date</span>
              <input
                className="form-input mt-1 w-full"
                value={resolved.sellDate}
                onChange={(e) => onUpdateVoucher({ sellDate: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-600">Warehouse</span>
              <input
                className={`form-input mt-1 w-full ${warehouseOk ? "" : "border-red-300"}`}
                value={warehouseLabel}
                readOnly
                title={
                  voucher.narrationRaw
                    ? `From Narration: ${voucher.narrationRaw}`
                    : "From empty Narration on invoice row → Goregaon"
                }
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-600">Client action</span>
              <select
                className="form-input mt-1 w-full"
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
                <option value="merge">Use existing</option>
                <option value="create">Create new</option>
              </select>
            </label>
          </div>

          {resolved.clientAction === "merge" ? (
            <label className="block text-sm sm:max-w-md">
              <span className="font-medium text-stone-600">Merge into client</span>
              <select
                className="form-input mt-1 w-full"
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
            </label>
          ) : (
            <label className="block text-sm sm:max-w-md">
              <span className="font-medium text-stone-600">Secondary name (optional)</span>
              <input
                className="form-input mt-1 w-full"
                value={resolved.clientSecondaryName}
                onChange={(e) => onUpdateVoucher({ clientSecondaryName: e.target.value })}
                placeholder="Optional alias"
              />
            </label>
          )}

          {voucher.errors.length > 0 ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {voucher.errors.join("; ")}
            </p>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                Product lines
              </p>
              <p className="text-xs text-stone-400">
                {voucher.lines.length} row{voucher.lines.length === 1 ? "" : "s"}
              </p>
            </div>
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
          </div>
        </div>
      ) : null}
    </article>
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
  const ignored = resolved.ignore;
  const editsDisabled = hasErrors || ignored;

  const statusTone = ignored
    ? "skip"
    : hasErrors
      ? "error"
      : line.category === "matched"
        ? "matched"
        : "new";
  const statusLabel = ignored
    ? "Skipped"
    : hasErrors
      ? "Error"
      : line.category === "matched"
        ? "Matched"
        : "New product";

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        ignored
          ? "border-stone-200 bg-stone-50/70 opacity-70"
          : hasErrors
            ? "border-red-200 bg-red-50/40"
            : line.category === "matched"
              ? "border-sky-100 bg-sky-50/30"
              : "border-amber-100 bg-amber-50/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600">
          <input
            type="checkbox"
            className="rounded border-stone-300"
            checked={ignored}
            onChange={(e) => onUpdate({ ignore: e.target.checked })}
          />
          Skip
        </label>
        <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
        <span className="text-xs text-stone-400">Row {line.rowNumber}</span>
      </div>

      {hasErrors ? (
        <p className="mt-2 text-xs font-medium text-red-700">{line.errors.join("; ")}</p>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block text-sm">
          <span className="text-xs font-medium text-stone-500">Product</span>
          <input
            className="form-input mt-1 w-full"
            value={resolved.productName}
            onChange={(e) => onUpdate({ productName: e.target.value })}
            disabled={editsDisabled}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-stone-500">Qty</span>
          <input
            type="number"
            min={1}
            step={1}
            className="form-input mt-1 w-full tabular-nums"
            value={resolved.quantity}
            onChange={(e) => onUpdate({ quantity: e.target.value })}
            disabled={editsDisabled}
          />
        </label>

        <div className="text-sm">
          <span className="text-xs font-medium text-stone-500">Brand</span>
          {editsDisabled ? (
            <p className="mt-2 text-xs text-stone-400">
              {ignored ? "Skipped" : "Fix errors first"}
            </p>
          ) : (
            <div className="mt-1 space-y-1.5">
              <select
                className="form-input w-full !py-2 text-sm"
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
                <option value="merge">Existing brand</option>
                <option value="create">New brand</option>
              </select>
              {resolved.brandAction === "merge" ? (
                <select
                  className="form-input w-full !py-2 text-sm"
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
                  className="form-input w-full !py-2 text-sm"
                  value={resolved.brandName}
                  onChange={(e) => onUpdate({ brandName: e.target.value })}
                  placeholder="New brand name"
                />
              )}
            </div>
          )}
        </div>

        <div className="text-sm">
          <span className="text-xs font-medium text-stone-500">Product action</span>
          {editsDisabled ? (
            <p className="mt-2 text-xs text-stone-400">—</p>
          ) : (
            <div className="mt-1 space-y-1.5">
              <select
                className="form-input w-full !py-2 text-sm"
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
                <option value="merge">Existing product</option>
                <option value="create">New product</option>
              </select>
              {resolved.action === "merge" ? (
                <select
                  className="form-input w-full !py-2 text-sm"
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
                <p className="text-xs leading-snug text-emerald-800">
                  Create under{" "}
                  {resolved.brandAction === "merge" && brandId
                    ? brands.find((b) => b.id === brandId)?.name ?? "selected brand"
                    : resolved.brandName.trim() || "new brand"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesImportResultSummary({
  result,
  sourceFileName,
}: {
  result: SalesImportResult;
  sourceFileName?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-stone-900">Import result</h3>
      <p className="mt-1 text-sm text-stone-600">
        Warehouse
        {result.warehouses && result.warehouses.length > 1 ? "s" : ""}:{" "}
        {(result.warehouses ?? [result.warehouse])
          .map((warehouse) => `${warehouse.name} (${warehouse.code})`)
          .join(", ")}
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
        {result.completedAt ? (
          <span className="text-stone-600">
            Completed: {new Date(result.completedAt).toLocaleString("en-IN")}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => downloadSalesImportReport(result, sourceFileName)}
        >
          Download all import results (.xlsx)
        </Button>
      </div>

      {result.vouchers.length > 0 ? (
        <div className="mt-4 space-y-3">
          {result.vouchers.map((voucher) => {
            const voucherRows = result.rows.filter(
              (row) => row.voucherIndex === voucher.voucherIndex
            );
            const failedRows = voucherRows.filter((row) => row.status === "FAILED");

            return (
              <div
                key={voucher.voucherIndex}
                className="rounded-xl border border-stone-200 bg-stone-50/60 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-stone-900">
                    Invoice {voucher.invoiceNumber}
                  </span>
                  <span className="text-sm text-stone-600">{voucher.clientName}</span>
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
                  <ul className="mt-3 space-y-1 text-sm text-stone-700">
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
                  <p className="mt-2 text-sm text-stone-600">
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
            <thead className="text-xs uppercase text-stone-500">
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
                  <tr key={`${row.voucherIndex}-${row.rowNumber}`} className="border-t border-stone-100">
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

    </div>
  );
}
