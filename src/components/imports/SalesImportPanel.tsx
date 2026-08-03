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
import { useToast } from "@/contexts/ToastContext";
import { persistGeneratedImportReport } from "@/lib/imports/persistImportReport";
import { createSalesImportBatches } from "@/lib/imports/salesImportBatches";
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
  ignore: boolean;
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

type SalesImportImpact = {
  newProducts: number;
  newBrands: number;
  manuallyMatchedProducts: number;
  skippedMatchedProducts: number;
  ignoredInvoices: number;
  newProductItems: SalesImportImpactProductItem[];
  newBrandItems: SalesImportImpactBrandItem[];
  manuallyMatchedProductItems: SalesImportImpactProductItem[];
  skippedMatchedProductItems: SalesImportImpactProductItem[];
  ignoredInvoiceItems: SalesImportImpactInvoiceItem[];
};

type SalesImportImpactProductItem = {
  rowNumber: number;
  invoiceNumber: string;
  productName: string;
  brandName: string;
  quantity: string;
  warehouseName: string;
  matchedProductName?: string;
  matchedProductBrandName?: string;
};

type SalesImportImpactBrandItem = {
  brandName: string;
  rowNumber: number;
  invoiceNumber: string;
};

type SalesImportImpactInvoiceItem = {
  voucherIndex: number;
  invoiceNumber: string;
  clientName: string;
  productCount: number;
  matchedProductCount: number;
  warehouseName: string;
};

const EMPTY_IMPORT_IMPACT: SalesImportImpact = {
  newProducts: 0,
  newBrands: 0,
  manuallyMatchedProducts: 0,
  skippedMatchedProducts: 0,
  ignoredInvoices: 0,
  newProductItems: [],
  newBrandItems: [],
  manuallyMatchedProductItems: [],
  skippedMatchedProductItems: [],
  ignoredInvoiceItems: [],
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
      ignore: false,
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
    ignore: state?.ignore ?? false,
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

function summarizeSalesImportImpact(
  preview: SalesImportPreview,
  voucherActions: Record<number, VoucherActionState>,
  lineActions: Record<number, LineActionState>
): SalesImportImpact {
  let manuallyMatchedProducts = 0;
  let skippedMatchedProducts = 0;
  let ignoredInvoices = 0;
  const newBrandsByName = new Map<string, SalesImportImpactBrandItem>();
  const newProductsByName = new Map<string, SalesImportImpactProductItem>();
  const manuallyMatchedProductItems: SalesImportImpactProductItem[] = [];
  const skippedMatchedProductItems: SalesImportImpactProductItem[] = [];
  const ignoredInvoiceItems: SalesImportImpactInvoiceItem[] = [];

  for (const voucher of preview.vouchers) {
    const voucherState = resolvedVoucherAction(
      voucher,
      voucherActions[voucher.voucherIndex]
    );
    if (voucherState.ignore) {
      ignoredInvoices += 1;
      const matchedLines = voucher.lines.filter(
        (line) => line.category === "matched"
      );
      skippedMatchedProducts += matchedLines.length;
      ignoredInvoiceItems.push({
        voucherIndex: voucher.voucherIndex,
        invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
        clientName: voucherState.clientName || voucher.clientName,
        productCount: voucher.lines.length,
        matchedProductCount: matchedLines.length,
        warehouseName: voucher.warehouseName || "Unknown warehouse",
      });
      for (const line of matchedLines) {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        skippedMatchedProductItems.push({
          rowNumber: line.rowNumber,
          invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
          productName: state.productName || line.productName,
          brandName: state.brandName || line.brandName,
          quantity: state.quantity,
          warehouseName: line.warehouseName || voucher.warehouseName || "Unknown warehouse",
          matchedProductName: line.matchedProduct?.name,
        });
      }
      continue;
    }

    for (const line of voucher.lines) {
      const state = resolvedLineAction(line, lineActions[line.rowNumber]);
      if (state.ignore) {
        if (line.category === "matched") {
          skippedMatchedProducts += 1;
          skippedMatchedProductItems.push({
            rowNumber: line.rowNumber,
            invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
            productName: state.productName || line.productName,
            brandName: state.brandName || line.brandName,
            quantity: state.quantity,
            warehouseName: line.warehouseName || voucher.warehouseName || "Unknown warehouse",
            matchedProductName: line.matchedProduct?.name,
          });
        }
        continue;
      }
      if (line.errors.length > 0 || !line.warehouseId) continue;
      if (
        line.category === "unmatched" &&
        state.action === "merge" &&
        state.mergeTargetProductId
      ) {
        const targetProduct = preview.existingProducts.find(
          (product) => product.id === state.mergeTargetProductId
        );
        manuallyMatchedProducts += 1;
        manuallyMatchedProductItems.push({
          rowNumber: line.rowNumber,
          invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
          productName: state.productName || line.productName,
          brandName: state.brandName || line.brandName,
          quantity: state.quantity,
          warehouseName: line.warehouseName || voucher.warehouseName || "Unknown warehouse",
          matchedProductName: targetProduct?.name || "Selected existing product",
          matchedProductBrandName: targetProduct?.brandName,
        });
      }
      if (state.action === "create") {
        const key = normalizeLookupKey(state.productName || line.productName);
        if (!newProductsByName.has(key)) {
          newProductsByName.set(key, {
            rowNumber: line.rowNumber,
            invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
            productName: state.productName || line.productName,
            brandName: state.brandName || line.brandName,
            quantity: state.quantity,
            warehouseName: line.warehouseName || voucher.warehouseName || "Unknown warehouse",
          });
        }
      }
      if (state.brandAction === "create" && state.brandName.trim()) {
        const key = normalizeLookupKey(state.brandName);
        if (!newBrandsByName.has(key)) {
          newBrandsByName.set(key, {
            brandName: state.brandName.trim(),
            rowNumber: line.rowNumber,
            invoiceNumber: voucherState.invoiceNumber || voucher.invoiceNumber,
          });
        }
      }
    }
  }

  return {
    newProducts: newProductsByName.size,
    newBrands: newBrandsByName.size,
    manuallyMatchedProducts,
    skippedMatchedProducts,
    ignoredInvoices,
    newProductItems: [...newProductsByName.values()],
    newBrandItems: [...newBrandsByName.values()],
    manuallyMatchedProductItems,
    skippedMatchedProductItems,
    ignoredInvoiceItems,
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
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [voucherActions, setVoucherActions] = useState<Record<number, VoucherActionState>>({});
  const [lineActions, setLineActions] = useState<Record<number, LineActionState>>({});
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmReviewOpen, setConfirmReviewOpen] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState<{
    current: number;
    total: number;
    invoicesDone: number;
    invoicesTotal: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importImpact = useMemo(
    () =>
      preview
        ? summarizeSalesImportImpact(preview, voucherActions, lineActions)
        : EMPTY_IMPORT_IMPACT,
    [preview, voucherActions, lineActions]
  );

  const activeImportTotals = useMemo(() => {
    if (!preview) return { invoices: 0, lines: 0 };
    let invoices = 0;
    let lines = 0;
    for (const voucher of preview.vouchers) {
      if (resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]).ignore) {
        continue;
      }
      const activeLines = voucher.lines.filter((line) => {
        const state = resolvedLineAction(line, lineActions[line.rowNumber]);
        return !state.ignore && line.errors.length === 0 && Boolean(line.warehouseId);
      }).length;
      if (activeLines > 0) {
        invoices += 1;
        lines += activeLines;
      }
    }
    return { invoices, lines };
  }, [preview, voucherActions, lineActions]);

  const allLinesReady = useMemo(() => {
    if (!preview) return false;

    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
      if (voucherState.ignore) continue;
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
      resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]).ignore
        ? []
        :
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
      const nextVoucherActions = initVoucherActions(data);
      const nextLineActions = initLineActions(data);
      setPreview(data);
      setVoucherActions(nextVoucherActions);
      setLineActions(nextLineActions);
      const impact = summarizeSalesImportImpact(
        data,
        nextVoucherActions,
        nextLineActions
      );
      if (impact.newProducts > 0 || impact.newBrands > 0) {
        pushToast({
          title: "New records will be created",
          message: `${impact.newProducts} product${impact.newProducts === 1 ? "" : "s"} and ${impact.newBrands} brand${impact.newBrands === 1 ? "" : "s"} are currently set to be created. Review the highlighted rows before confirming.`,
          variant: "warning",
          durationMs: 9000,
        });
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Failed to read Excel file");
    } finally {
      setLoading(false);
    }
  }

  function updateVoucherAction(voucherIndex: number, patch: Partial<VoucherActionState>) {
    const voucher = preview?.vouchers.find(
      (item) => item.voucherIndex === voucherIndex
    );
    const current = voucher
      ? resolvedVoucherAction(voucher, voucherActions[voucherIndex])
      : voucherActions[voucherIndex];
    if (voucher && current && patch.ignore === true && !current.ignore) {
      const matchedProducts = voucher.lines.filter(
        (line) => line.category === "matched"
      ).length;
      pushToast({
        title: "Invoice will be skipped",
        message: `Invoice ${current.invoiceNumber || voucher.invoiceNumber} is ignored${
          matchedProducts > 0
            ? `, including ${matchedProducts} matched product${matchedProducts === 1 ? "" : "s"}`
            : ""
        }. It will not be imported.`,
        variant: "warning",
        durationMs: 8000,
      });
    }
    setVoucherActions((prev) => ({
      ...prev,
      [voucherIndex]: { ...prev[voucherIndex], ...patch },
    }));
  }

  function updateLineAction(rowNumber: number, patch: Partial<LineActionState>) {
    const voucher = preview?.vouchers.find((item) =>
      item.lines.some((line) => line.rowNumber === rowNumber)
    );
    const line = voucher?.lines.find((item) => item.rowNumber === rowNumber);
    const current = line
      ? resolvedLineAction(line, lineActions[rowNumber])
      : lineActions[rowNumber];
    if (line && current) {
      if (patch.ignore === true && !current.ignore && voucher) {
        const otherActiveLines = voucher.lines.filter((voucherLine) => {
          if (voucherLine.rowNumber === rowNumber) return false;
          return !resolvedLineAction(
            voucherLine,
            lineActions[voucherLine.rowNumber]
          ).ignore;
        }).length;
        if (otherActiveLines === 0) {
          pushToast({
            title: "Cannot skip the only product",
            message: `Invoice ${resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]).invoiceNumber || voucher.invoiceNumber} has only one active product. Use “Ignore this entire invoice” if you want to exclude the invoice.`,
            variant: "warning",
            durationMs: 9000,
          });
          return;
        }
      }
      if (patch.ignore === true && !current.ignore && line.category === "matched") {
        pushToast({
          title: "Matched product will be skipped",
          message: `${current.productName || line.productName} on Excel row ${rowNumber} matches an existing product but is now ignored.`,
          variant: "warning",
          durationMs: 8000,
        });
      }
      if (patch.action === "create" && current.action !== "create") {
        pushToast({
          title: "New product selected",
          message: `${current.productName || line.productName} on Excel row ${rowNumber} will be created as a new product.`,
          variant: "warning",
          durationMs: 8000,
        });
      }
      if (
        line.category === "unmatched" &&
        patch.mergeTargetProductId &&
        patch.mergeTargetProductId !== current.mergeTargetProductId
      ) {
        const targetProduct = preview?.existingProducts.find(
          (product) => product.id === patch.mergeTargetProductId
        );
        pushToast({
          title: "Product manually matched",
          message: `${current.productName || line.productName} will use the existing product ${targetProduct?.name || "you selected"}.`,
          variant: "info",
          durationMs: 7000,
        });
      }
      if (patch.brandAction === "create" && current.brandAction !== "create") {
        pushToast({
          title: "New brand selected",
          message: `${current.brandName || line.brandName} on Excel row ${rowNumber} will be created as a new brand.`,
          variant: "warning",
          durationMs: 8000,
        });
      }
    }
    setLineActions((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], ...patch },
    }));
  }

  async function handleConfirm(reviewConfirmed = false) {
    if (!preview) return;

    const validationErrors: string[] = [];
    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(voucher, voucherActions[voucher.voucherIndex]);
      if (voucherState.ignore) continue;
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

    if (!reviewConfirmed) {
      setConfirmReviewOpen(true);
      return;
    }

    setConfirmReviewOpen(false);
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
            ignore: voucherState.ignore,
            mergeTargetClientId:
              voucherState.clientAction === "merge"
                ? voucherState.mergeTargetClientId
                : undefined,
            lines: voucher.lines
              .map((line) => {
                const state = resolvedLineAction(line, lineActions[line.rowNumber]);
                const ignored = voucherState.ignore || state.ignore;
                if (!ignored && (line.errors.length > 0 || !line.warehouseId)) {
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
                  quantity: Number.parseInt(state.quantity, 10) || 0,
                  warehouseId: line.warehouseId || "",
                  ignore: ignored,
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
                      (line.ignore ||
                        ((line.brandAction === "merge" ? line.mergeTargetBrandId : line.brandName) &&
                          (line.action === "merge" ? line.mergeTargetProductId : true)))
                  )
              ),
          };
        })
        .filter(
          (voucher): voucher is NonNullable<typeof voucher> =>
            Boolean(voucher && voucher.lines.length > 0)
        );

      if (vouchers.length === 0) {
        setError("No product lines left to import (all ignored or invalid)");
        return;
      }

      const batches = createSalesImportBatches(
        vouchers,
        SALES_IMPORT_CONFIRM_BATCH_SIZE
      );
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
            try {
              await persistGeneratedImportReport("sales", partial, file?.name);
            } catch {
              // The partial-import warning below remains the primary actionable message.
            }
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
      try {
        await persistGeneratedImportReport("sales", importResult, file?.name);
      } catch (reportError) {
        setError(
          reportError instanceof ApiError
            ? `Import completed, but its generated Excel file could not be saved: ${reportError.message}`
            : "Import completed, but its generated Excel file could not be saved"
        );
      }
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
      const matchedCount = importResult.rows.filter(
        (row) => row.status === "SUCCESS" && row.action === "merge"
      ).length;
      const skippedCount = importResult.rows.filter(
        (row) => row.status === "SKIPPED"
      ).length;
      if (matchedCount > 0 || skippedCount > 0) {
        pushToast({
          title: "Matched or skipped products",
          message: `${matchedCount} matched product${matchedCount === 1 ? " used" : "s used"} existing records${skippedCount ? `; ${skippedCount} row${skippedCount === 1 ? " was" : "s were"} skipped` : ""}.`,
          variant: "warning",
          durationMs: 8000,
        });
      }
      if (
        importResult.createdProductCount ||
        importResult.createdBrandCount ||
        importResult.createdClientCount
      ) {
        pushToast({
          title: "New records created by import",
          message: `${importResult.createdProductCount ?? 0} products, ${importResult.createdBrandCount ?? 0} brands, and ${importResult.createdClientCount ?? 0} clients were created.`,
          variant: "success",
          durationMs: 8000,
        });
      }
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
          impact={importImpact}
          onUpdateVoucher={updateVoucherAction}
          onUpdateLine={updateLineAction}
          onConfirm={() => void handleConfirm()}
        />
      )}

      {preview && confirmReviewOpen ? (
        <SalesImportConfirmationModal
          impact={importImpact}
          totalInvoices={activeImportTotals.invoices}
          totalLines={activeImportTotals.lines}
          onCancel={() => setConfirmReviewOpen(false)}
          onConfirm={() => void handleConfirm(true)}
        />
      ) : null}

      {result && <SalesImportResultSummary result={result} sourceFileName={result.fileName} />}
    </div>
  );
}

function SalesImportConfirmationModal({
  impact,
  totalInvoices,
  totalLines,
  onCancel,
  onConfirm,
}: {
  impact: SalesImportImpact;
  totalInvoices: number;
  totalLines: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasWarnings =
    impact.newProducts > 0 ||
    impact.newBrands > 0 ||
    impact.manuallyMatchedProducts > 0 ||
    impact.skippedMatchedProducts > 0 ||
    impact.ignoredInvoices > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sales-import-confirmation-title"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[min(90vh,58rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-stone-200 bg-stone-50 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                Final review
              </p>
              <h2
                id="sales-import-confirmation-title"
                className="mt-1 text-xl font-bold text-stone-950"
              >
                Confirm stock out import
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Review every product creation and skipped match before importing {totalLines} product lines across {totalInvoices} invoices.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              aria-label="Close confirmation"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ImpactCountCard label="New products" value={impact.newProducts} tone="amber" />
            <ImpactCountCard label="New brands" value={impact.newBrands} tone="indigo" />
            <ImpactCountCard label="Manually matched" value={impact.manuallyMatchedProducts} tone="sky" />
            <ImpactCountCard label="Matched skipped" value={impact.skippedMatchedProducts} tone="violet" />
            <ImpactCountCard label="Invoices ignored" value={impact.ignoredInvoices} tone="stone" />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          {!hasWarnings ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              No new products or brands will be created, and no matched products or invoices are being skipped.
            </div>
          ) : null}

          {impact.newProductItems.length > 0 ? (
            <ImpactProductSection
              title={`New products to create (${impact.newProductItems.length})`}
              description="These Excel products do not use an existing product record."
              items={impact.newProductItems}
              tone="amber"
            />
          ) : null}

          {impact.newBrandItems.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-indigo-200">
              <div className="bg-indigo-50 px-4 py-3">
                <h3 className="text-sm font-bold text-indigo-950">
                  New brands to create ({impact.newBrandItems.length})
                </h3>
                <p className="mt-0.5 text-xs text-indigo-800">
                  Each brand is counted once, even when used by several product rows.
                </p>
              </div>
              <div className="divide-y divide-stone-100">
                {impact.newBrandItems.map((item) => (
                  <div
                    key={`${item.brandName}-${item.rowNumber}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <span className="font-semibold text-stone-900">{item.brandName}</span>
                    <span className="text-xs text-stone-500">
                      Invoice {item.invoiceNumber} · Excel row {item.rowNumber}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {impact.manuallyMatchedProductItems.length > 0 ? (
            <ImpactProductSection
              title={`Manually matched products (${impact.manuallyMatchedProductItems.length})`}
              description="These Excel rows were manually assigned to existing product records and will use those records for stock out."
              items={impact.manuallyMatchedProductItems}
              tone="sky"
              showMatchedProduct
            />
          ) : null}

          {impact.skippedMatchedProductItems.length > 0 ? (
            <ImpactProductSection
              title={`Matched products being skipped (${impact.skippedMatchedProductItems.length})`}
              description="These rows matched existing products but will not be included in stock out."
              items={impact.skippedMatchedProductItems}
              tone="violet"
              showMatchedProduct
            />
          ) : null}

          {impact.ignoredInvoiceItems.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-stone-300">
              <div className="bg-stone-100 px-4 py-3">
                <h3 className="text-sm font-bold text-stone-950">
                  Ignored invoices ({impact.ignoredInvoiceItems.length})
                </h3>
                <p className="mt-0.5 text-xs text-stone-600">
                  Every product line inside these invoices will be skipped.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-2.5">Invoice</th>
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-4 py-2.5">Warehouse</th>
                      <th className="px-4 py-2.5">Products</th>
                      <th className="px-4 py-2.5">Matched</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {impact.ignoredInvoiceItems.map((item) => (
                      <tr key={item.voucherIndex}>
                        <td className="px-4 py-3 font-semibold text-stone-900">{item.invoiceNumber}</td>
                        <td className="px-4 py-3 text-stone-700">{item.clientName}</td>
                        <td className="px-4 py-3 text-stone-600">{item.warehouseName}</td>
                        <td className="px-4 py-3 tabular-nums text-stone-700">{item.productCount}</td>
                        <td className="px-4 py-3 tabular-nums text-violet-700">{item.matchedProductCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-5 py-4 sm:px-7">
          <p className="text-xs text-stone-500">
            Cancel to return to the preview and change any row action.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Back to review
            </Button>
            <Button type="button" onClick={onConfirm}>
              Confirm and start import
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImpactCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "indigo" | "sky" | "violet" | "stone";
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
    violet: "border-violet-200 bg-violet-50 text-violet-950",
    stone: "border-stone-200 bg-white text-stone-950",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${styles}`}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-semibold">{label}</p>
    </div>
  );
}

function ImpactProductSection({
  title,
  description,
  items,
  tone,
  showMatchedProduct = false,
}: {
  title: string;
  description: string;
  items: SalesImportImpactProductItem[];
  tone: "amber" | "sky" | "violet";
  showMatchedProduct?: boolean;
}) {
  const sectionStyle = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
    violet: "border-violet-200 bg-violet-50 text-violet-950",
  }[tone];
  return (
    <section className={`overflow-hidden rounded-2xl border ${sectionStyle.split(" ")[0]}`}>
      <div className={`px-4 py-3 ${sectionStyle.split(" ").slice(1).join(" ")}`}>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-0.5 text-xs opacity-80">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5">Brand</th>
              <th className="px-4 py-2.5">Invoice / row</th>
              <th className="px-4 py-2.5">Quantity</th>
              <th className="px-4 py-2.5">Warehouse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {items.map((item) => (
              <tr key={`${item.invoiceNumber}-${item.rowNumber}`}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-stone-900">{item.productName}</p>
                  {showMatchedProduct && item.matchedProductName ? (
                    <p className="mt-0.5 text-xs text-sky-700">
                      Matched existing: {item.matchedProductName}
                      {item.matchedProductBrandName
                        ? ` — ${item.matchedProductBrandName}`
                        : ""}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-stone-700">{item.brandName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                  {item.invoiceNumber} · row {item.rowNumber}
                </td>
                <td className="px-4 py-3 tabular-nums text-stone-700">{item.quantity}</td>
                <td className="px-4 py-3 text-stone-600">{item.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  impact,
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
  impact: SalesImportImpact;
  onUpdateVoucher: (voucherIndex: number, patch: Partial<VoucherActionState>) => void;
  onUpdateLine: (rowNumber: number, patch: Partial<LineActionState>) => void;
  onConfirm: () => void;
}) {
  const [filter, setFilter] = useState<PreviewFilter>(() =>
    preview.unmatchedCount > 0 ||
    preview.errorCount > 0 ||
    preview.vouchers.some((voucher) => voucher.clientCategory === "new")
      ? "needs_review"
      : "all"
  );
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(20);

  const needsReviewCount = useMemo(() => {
    let count = 0;
    for (const voucher of preview.vouchers) {
      const voucherState = resolvedVoucherAction(
        voucher,
        voucherActions[voucher.voucherIndex]
      );
      if (voucherState.ignore) continue;
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
      const voucherState = resolvedVoucherAction(
        voucher,
        voucherActions[voucher.voucherIndex]
      );
      if (voucherState.ignore) return sum;
      return (
        sum +
        voucher.lines.filter((line) => {
          const state = resolvedLineAction(line, lineActions[line.rowNumber]);
          return !state.ignore && line.errors.length === 0 && Boolean(line.warehouseId);
        }).length
      );
    }, 0);
  }, [preview, voucherActions, lineActions]);

  const filteredVouchers = useMemo(() => {
    if (filter === "all") return preview.vouchers;
    return preview.vouchers.filter((voucher) => {
      const voucherState = resolvedVoucherAction(
        voucher,
        voucherActions[voucher.voucherIndex]
      );
      if (voucherState.ignore) return false;
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
  const visibleVouchers = filteredVouchers.slice(0, visibleCount);

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
              onClick={() => {
                setFilter(item.id);
                setVisibleCount(20);
              }}
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

      <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4 sm:grid-cols-3">
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">1</span>
          <div><p className="text-sm font-bold text-stone-900">Open review items</p><p className="mt-0.5 text-xs leading-relaxed text-stone-500">Start with amber or red invoices. Ready invoices can stay collapsed.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">2</span>
          <div><p className="text-sm font-bold text-stone-900">Check automatic matches</p><p className="mt-0.5 text-xs leading-relaxed text-stone-500">Blue product rows already use an existing product and need no action.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">3</span>
          <div><p className="text-sm font-bold text-stone-900">Confirm once ready</p><p className="mt-0.5 text-xs leading-relaxed text-stone-500">The bottom bar shows exactly what is ready and what still needs attention.</p></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-600">
        <span className="font-bold uppercase tracking-wide text-stone-400">Row colours</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500" />Matched product</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500" />Needs review</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" />Error</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-violet-500" />Ignored</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" />Ready</span>
      </div>

      <div
        className={`rounded-2xl border-2 p-4 ${
          impact.newProducts > 0 ||
          impact.newBrands > 0 ||
          impact.manuallyMatchedProducts > 0 ||
          impact.skippedMatchedProducts > 0 ||
          impact.ignoredInvoices > 0
            ? "border-orange-300 bg-orange-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-stone-900">Import impact</p>
            <p className="mt-1 text-xs text-stone-600">
              These are the actions that will happen when you confirm the import.
            </p>
          </div>
          {impact.newProducts === 0 &&
          impact.newBrands === 0 &&
          impact.manuallyMatchedProducts === 0 &&
          impact.skippedMatchedProducts === 0 &&
          impact.ignoredInvoices === 0 ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              No creation or skip warnings
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${impact.newProducts > 0 ? "bg-amber-200 text-amber-900" : "bg-white text-stone-500"}`}>
            New products: {impact.newProducts}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${impact.newBrands > 0 ? "bg-indigo-200 text-indigo-900" : "bg-white text-stone-500"}`}>
            New brands: {impact.newBrands}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${impact.manuallyMatchedProducts > 0 ? "bg-sky-200 text-sky-900" : "bg-white text-stone-500"}`}>
            Manually matched: {impact.manuallyMatchedProducts}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${impact.skippedMatchedProducts > 0 ? "bg-violet-200 text-violet-900" : "bg-white text-stone-500"}`}>
            Matched products skipped: {impact.skippedMatchedProducts}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${impact.ignoredInvoices > 0 ? "bg-stone-200 text-stone-900" : "bg-white text-stone-500"}`}>
            Invoices ignored: {impact.ignoredInvoices}
          </span>
        </div>
      </div>

      {filteredVouchers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-500">
          No invoices in this filter.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50"
              onClick={() =>
                setCollapsed(
                  Object.fromEntries(visibleVouchers.map((voucher) => [voucher.voucherIndex, false]))
                )
              }
            >
              Expand visible
            </button>
            <button
              type="button"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50"
              onClick={() =>
                setCollapsed(
                  Object.fromEntries(visibleVouchers.map((voucher) => [voucher.voucherIndex, true]))
                )
              }
            >
              Collapse visible
            </button>
          </div>
          {visibleVouchers.map((voucher) => (
            <VoucherReviewCard
              key={voucher.voucherIndex}
              voucher={voucher}
              products={preview.existingProducts}
              brands={preview.existingBrands}
              clients={preview.existingClients}
              voucherState={voucherActions[voucher.voucherIndex]}
              lineActions={lineActions}
              collapsed={collapsed[voucher.voucherIndex] ?? true}
              onToggleCollapsed={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [voucher.voucherIndex]: !(prev[voucher.voucherIndex] ?? true),
                }))
              }
              onUpdateVoucher={(patch) => onUpdateVoucher(voucher.voucherIndex, patch)}
              onUpdateLine={onUpdateLine}
            />
          ))}
          {visibleVouchers.length < filteredVouchers.length ? (
            <button
              type="button"
              className="w-full rounded-xl border-2 border-dashed border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-600 hover:border-orange-300 hover:bg-orange-50"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              Show 20 more · {filteredVouchers.length - visibleVouchers.length} remaining
            </button>
          ) : null}
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
  tone: "matched" | "new" | "error" | "skip" | "neutral" | "ready";
  children: ReactNode;
}) {
  const classes = {
    matched: "bg-sky-100 text-sky-800",
    new: "bg-amber-100 text-amber-900",
    error: "bg-red-100 text-red-800",
    skip: "bg-violet-100 text-violet-800",
    neutral: "bg-stone-100 text-stone-700",
    ready: "bg-emerald-100 text-emerald-800",
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
  const invoiceIgnored = resolved.ignore;
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
  const needsReview =
    !invoiceIgnored &&
    (voucher.errors.length > 0 ||
      voucher.clientCategory === "new" ||
      !resolved.clientName.trim() ||
      !resolved.invoiceNumber.trim() ||
      (resolved.clientAction === "merge" && !resolved.mergeTargetClientId) ||
      voucher.lines.some((line) =>
        lineNeedsReview(line, resolvedLineAction(line, lineActions[line.rowNumber]))
      ));
  const hasInvoiceError = voucher.errors.length > 0 || errorLines > 0 || !warehouseOk;
  const cardToneClass = invoiceIgnored
    ? "border-violet-300 border-l-violet-500 bg-violet-50/80"
    : hasInvoiceError
      ? "border-red-300 border-l-red-500 bg-red-50/70"
      : needsReview
        ? "border-amber-300 border-l-amber-500 bg-amber-50/70"
        : "border-emerald-300 border-l-emerald-500 bg-emerald-50/70";

  return (
    <article className={`overflow-hidden rounded-2xl border border-l-4 shadow-sm shadow-stone-900/[0.03] ${cardToneClass}`}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-start justify-between gap-3 border-b border-current/10 px-4 py-3 text-left transition hover:bg-white/60"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-stone-900">
              Invoice {resolved.invoiceNumber || "—"}
            </h3>
            {invoiceIgnored ? <StatusPill tone="skip">Invoice skipped</StatusPill> : null}
            {!invoiceIgnored ? (
              <StatusPill tone={needsReview ? "new" : "ready"}>
                {needsReview ? "Needs review" : "Ready"}
              </StatusPill>
            ) : null}
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
          {collapsed ? (needsReview ? "Review" : "Open") : "Hide"}
        </span>
      </button>

      {!collapsed ? (
        <div className="space-y-4 p-4">
          <label className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
            <input
              type="checkbox"
              className="rounded border-stone-300"
              checked={invoiceIgnored}
              onChange={(e) => onUpdateVoucher({ ignore: e.target.checked })}
            />
            Ignore this entire invoice
          </label>
          <fieldset disabled={invoiceIgnored} className="contents">
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
          </fieldset>
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
  const [editingMatch, setEditingMatch] = useState(line.category !== "matched");

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

  if (ignored) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-violet-300 border-l-violet-500 bg-violet-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="skip">Skipped</StatusPill>
            <span className="text-xs text-stone-400">Excel row {line.rowNumber}</span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-violet-900">{resolved.productName}</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
          onClick={() => onUpdate({ ignore: false })}
        >
          Restore line
        </button>
      </div>
    );
  }

  if (line.category === "matched" && !hasErrors && !editingMatch) {
    return (
      <div className="rounded-xl border border-l-4 border-sky-300 border-l-sky-500 bg-sky-50 px-4 py-3">
        <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="matched">Automatic match</StatusPill>
              <span className="text-xs text-stone-400">Excel row {line.rowNumber}</span>
            </div>
            <p className="mt-1 truncate text-sm font-bold text-stone-900">{resolved.productName}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Quantity</p>
            <p className="mt-0.5 font-bold tabular-nums text-stone-900">{resolved.quantity}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Uses existing product</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-sky-900">
              {line.matchedProduct?.name ?? resolved.productName}
            </p>
            <p className="truncate text-xs text-sky-700">
              {line.matchedProduct?.brandName ?? resolved.brandName}
            </p>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50"
              onClick={() => setEditingMatch(true)}
            >
              Change
            </button>
            <button
              type="button"
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50"
              onClick={() => onUpdate({ ignore: true })}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        ignored
          ? "border-violet-300 bg-violet-50"
          : hasErrors
            ? "border-red-300 border-l-4 border-l-red-500 bg-red-50"
            : line.category === "matched"
              ? "border-sky-300 border-l-4 border-l-sky-500 bg-sky-50"
              : "border-amber-300 border-l-4 border-l-amber-500 bg-amber-50"
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
        {line.category === "matched" && editingMatch ? (
          <button
            type="button"
            className="ml-auto text-xs font-bold text-sky-700 hover:text-sky-900"
            onClick={() => {
              onUpdate({
                brandAction: "merge",
                mergeTargetBrandId: line.matchedProduct?.brandId,
                brandName: line.matchedProduct?.brandName ?? resolved.brandName,
                action: "merge",
                mergeTargetProductId: line.matchedProduct?.id,
              });
              setEditingMatch(false);
            }}
          >
            Use automatic match
          </button>
        ) : null}
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
