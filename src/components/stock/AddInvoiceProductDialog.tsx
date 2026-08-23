"use client";

import { useEffect, useState } from "react";
import { BrandProductFields } from "@/components/stock/BrandProductFields";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api/client";
import {
  formatThresholdPreview,
  getBaseUnitLabel,
  getStockUnitLabel,
  thresholdDisplayToBase,
  usesStockUnit,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { validatePositiveInteger } from "@/lib/validation/quantity";
import type { Product } from "@/types/master";
import type { InvoiceGroup } from "@/types/stock";

type AddInvoiceProductDialogProps = {
  group: InvoiceGroup;
  quantityMode: QuantityEntryMode;
  onClose: () => void;
  onAdded: (productName: string) => Promise<void> | void;
};

export function AddInvoiceProductDialog({
  group,
  quantityMode,
  onClose,
  onAdded,
}: AddInvoiceProductDialogProps) {
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    let cancelled = false;
    setLoadingProduct(true);
    setError("");
    api.products
      .get(productId)
      .then((result) => {
        if (!cancelled) setProduct(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setProduct(null);
        setError(err instanceof ApiError ? err.message : "Could not load product");
      })
      .finally(() => {
        if (!cancelled) setLoadingProduct(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!productId || !product) {
      setError("Select a product");
      return;
    }
    const baseQuantity = thresholdDisplayToBase(quantity, quantityMode, product);
    const quantityError =
      baseQuantity == null ? "Enter a valid quantity" : validatePositiveInteger(baseQuantity);
    if (quantityError || baseQuantity == null) {
      setError(quantityError ?? "Enter a valid quantity");
      return;
    }

    const anchor = group.lines.find(
      (line) => line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING"
    );
    if (!anchor) {
      setError("This invoice does not have an editable sale line");
      return;
    }

    setSaving(true);
    try {
      await api.inventory.addInvoiceProduct(anchor.movementId, {
        productId,
        quantity: baseQuantity,
      });
      await onAdded(product.name);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  const unitLabel =
    quantityMode === "stockUnit" && usesStockUnit(product)
      ? getStockUnitLabel(product)
      : getBaseUnitLabel(product);
  const preview = product
    ? formatThresholdPreview(quantity, quantityMode, product)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-invoice-product-title"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-100 px-6 py-5">
          <h2 id="add-invoice-product-title" className="text-lg font-semibold text-zinc-900">
            Add product to invoice
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Invoice {group.invoiceNumber || "—"} · {group.clientName || "Client"}
            {group.warehouse?.name ? ` · ${group.warehouse.name}` : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <BrandProductFields
            brandId={brandId}
            productId={productId}
            onBrandChange={setBrandId}
            onProductChange={(id) => {
              setProductId(id);
              setQuantity("");
            }}
            disabled={saving}
          />

          <div>
            <label className="block text-sm font-semibold text-stone-700" htmlFor="invoice-product-quantity">
              Quantity{product ? ` (${unitLabel})` : ""}
            </label>
            <input
              id="invoice-product-quantity"
              type="number"
              min={quantityMode === "stockUnit" && usesStockUnit(product) ? "0.0001" : 1}
              step={quantityMode === "stockUnit" && usesStockUnit(product) ? "any" : 1}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!product || loadingProduct || saving}
              className="form-input mt-1.5 w-full tabular-nums"
              placeholder={product ? `Enter ${unitLabel}` : "Select a product first"}
            />
            {preview ? <p className="mt-1 text-xs text-stone-500">{preview}</p> : null}
          </div>

          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        </div>

        <div className="shrink-0 flex justify-end gap-2 border-t border-zinc-100 bg-white px-6 py-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving} disabled={!product || loadingProduct}>
            Add product
          </Button>
        </div>
      </form>
    </div>
  );
}
