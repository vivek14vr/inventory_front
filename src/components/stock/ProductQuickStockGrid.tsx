"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StockQuantityEntry } from "@/components/stock/StockQuantityEntry";
import { api, ApiError } from "@/lib/api/client";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  quantityEntryToBase,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { productPickerSubtitle } from "@/lib/products/productNames";
import { validatePositiveInteger } from "@/lib/validation/quantity";
import type { Product } from "@/types/master";

const TILE_COLORS = [
  {
    tile: "border-orange-200 bg-orange-50",
    icon: "bg-orange-600 text-white",
  },
  {
    tile: "border-amber-200 bg-amber-50",
    icon: "bg-amber-500 text-white",
  },
  {
    tile: "border-sky-200 bg-sky-50",
    icon: "bg-sky-600 text-white",
  },
  {
    tile: "border-violet-200 bg-violet-50",
    icon: "bg-violet-600 text-white",
  },
  {
    tile: "border-rose-200 bg-rose-50",
    icon: "bg-rose-600 text-white",
  },
  {
    tile: "border-teal-200 bg-teal-50",
    icon: "bg-teal-600 text-white",
  },
] as const;

type QtyState = {
  quantity: string;
  quantityMode: QuantityEntryMode;
};

export type CollectedStockItem = {
  productId: string;
  product: Product;
  quantity: string;
  quantityMode: QuantityEntryMode;
  baseQty: number;
};

type ProductQuickStockGridProps = {
  /**
   * in = save stock-in batch
   * out = save direct sale batch (includes client fields)
   * collect = return filled lines via onCollect (sale cart / multi-brand)
   */
  action?: "in" | "out" | "collect";
  title?: string;
  subtitle?: string;
  products: Product[];
  brandId: string;
  brandName?: string;
  warehouseId?: string;
  loading?: boolean;
  emptyMessage?: string;
  quantityFor?: (productId: string) => number | undefined;
  loadingQuantity?: boolean;
  /** Hide products already on the sale cart */
  excludeProductIds?: Set<string>;
  submitLabel?: string;
  onCollect?: (items: CollectedStockItem[]) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

function formatAvailable(
  baseQty: number | undefined,
  product: Product,
  loading: boolean
): string | undefined {
  if (loading) return "Loading stock…";
  if (baseQty === undefined) return undefined;
  if (baseQty <= 0) return `Available: ${formatBaseUnits(0, product)}`;
  return `Available: ${formatBaseQuantityWithStockUnit(baseQty, product)}`;
}

export function ProductQuickStockGrid({
  action = "in",
  title = "Select product",
  subtitle,
  products,
  brandId,
  brandName,
  warehouseId,
  loading,
  emptyMessage = "No products for this brand. Add products first.",
  quantityFor,
  loadingQuantity,
  excludeProductIds,
  submitLabel,
  onCollect,
  onSuccess,
  onError,
}: ProductQuickStockGridProps) {
  const isOut = action === "out";
  const isCollect = action === "collect";
  const checkStock = isOut || isCollect;
  const [qtyByProductId, setQtyByProductId] = useState<Record<string, QtyState>>({});
  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) => !excludeProductIds?.has(product.id)
      ),
    [products, excludeProductIds]
  );

  const filledItems = useMemo(() => {
    const items: CollectedStockItem[] = [];
    for (const product of visibleProducts) {
      const state = qtyByProductId[product.id];
      if (!state?.quantity.trim()) continue;
      const entered = parseInt(state.quantity, 10);
      if (!Number.isFinite(entered) || entered <= 0) continue;
      const baseQty = quantityEntryToBase(entered, state.quantityMode, product);
      if (validatePositiveInteger(baseQty)) continue;
      items.push({
        productId: product.id,
        product,
        quantity: state.quantity,
        quantityMode: state.quantityMode,
        baseQty,
      });
    }
    return items;
  }, [visibleProducts, qtyByProductId]);

  function updateQty(productId: string, patch: Partial<QtyState>) {
    setQtyByProductId((prev) => ({
      ...prev,
      [productId]: {
        quantity: prev[productId]?.quantity ?? "",
        quantityMode: prev[productId]?.quantityMode ?? "stockUnit",
        ...patch,
      },
    }));
  }

  function assertStockOk(): boolean {
    if (!checkStock) return true;
    const over = filledItems.find((item) => {
      const available = quantityFor?.(item.productId);
      return available != null && item.baseQty > available;
    });
    if (!over) return true;
    onError?.(
      `Not enough stock for ${over.product.name}. Available: ${formatBaseQuantityWithStockUnit(
        quantityFor?.(over.productId) ?? 0,
        over.product
      )}`
    );
    return false;
  }

  async function handleSave() {
    onError?.("");
    if (filledItems.length === 0) {
      onError?.("Enter a quantity for at least one product");
      return;
    }
    if (!assertStockOk()) return;

    if (isCollect) {
      onCollect?.(filledItems);
      setQtyByProductId({});
      return;
    }

    if (isOut && !clientName.trim()) {
      onError?.("Client name is required");
      return;
    }

    setSubmitting(true);
    try {
      if (isOut) {
        const result = await api.stock.stockOutBatch({
          ...(warehouseId ? { warehouseId } : {}),
          clientName: clientName.trim(),
          invoiceNumber: invoiceNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          items: filledItems.map((item) => ({
            brandId,
            productId: item.productId,
            quantity: item.baseQty,
          })),
        });
        const invoicePart = result.invoiceNumber
          ? ` · Invoice ${result.invoiceNumber}`
          : "";
        const msg = `Sale recorded for ${result.clientName}${invoicePart} · ${result.movements.length} product(s)`;
        onSuccess?.(msg);
        setQtyByProductId({});
        setClientName("");
        setInvoiceNumber("");
        setNotes("");
      } else {
        const result = await api.stock.stockInBatch({
          ...(warehouseId ? { warehouseId } : {}),
          brandId,
          notes: notes.trim() || undefined,
          items: filledItems.map((item) => ({
            productId: item.productId,
            quantity: item.baseQty,
          })),
        });
        const msg = `Stock added for ${result.brandName ?? brandName ?? "brand"} · ${result.movements.length} product(s)`;
        onSuccess?.(msg);
        setQtyByProductId({});
        setNotes("");
      }
    } catch (err) {
      onError?.(
        err instanceof ApiError
          ? err.message
          : isOut
            ? "Failed to record sale"
            : "Failed to record stock in"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const saveDisabled =
    filledItems.length === 0 || (isOut && !clientName.trim());

  const buttonLabel =
    submitLabel ??
    (isCollect ? "Add to sale" : isOut ? "Save stock out" : "Save stock in");

  const hint = isCollect
    ? "Enter quantities, then Add to sale. Leave blank to skip. You can add another brand after."
    : "Enter quantities on product cards, then Save. Leave blank to skip.";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-base text-stone-500">{subtitle}</p> : null}
        <p className="mt-1 text-sm text-stone-500">{hint}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading…" />
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center">
          <p className="text-base font-medium text-stone-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product, index) => {
            const color = TILE_COLORS[index % TILE_COLORS.length];
            const initial = product.name.trim().charAt(0).toUpperCase() || "?";
            const state = qtyByProductId[product.id] ?? {
              quantity: "",
              quantityMode: "stockUnit" as QuantityEntryMode,
            };
            const availableQty = quantityFor?.(product.id);
            const available = formatAvailable(
              availableQty,
              product,
              Boolean(loadingQuantity)
            );
            const subtitleText = productPickerSubtitle(product);
            const entered = parseInt(state.quantity, 10);
            const baseQty =
              Number.isFinite(entered) && entered > 0
                ? quantityEntryToBase(entered, state.quantityMode, product)
                : 0;
            const exceeds =
              checkStock &&
              availableQty != null &&
              baseQty > 0 &&
              baseQty > availableQty;

            return (
              <div
                key={product.id}
                className={`flex flex-col rounded-2xl border-2 p-4 ${color.tile}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold shadow-md ${color.icon}`}
                  >
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold leading-tight text-stone-900">
                      {product.name}
                    </p>
                    {subtitleText ? (
                      <p className="mt-0.5 text-sm font-medium text-stone-500">
                        {subtitleText}
                      </p>
                    ) : null}
                    {available ? (
                      <p className="mt-1 text-sm font-bold text-stone-800">{available}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3">
                  <StockQuantityEntry
                    product={product}
                    quantity={state.quantity}
                    onQuantityChange={(value) =>
                      updateQty(product.id, { quantity: value })
                    }
                    mode={state.quantityMode}
                    onModeChange={(mode) =>
                      updateQty(product.id, { quantityMode: mode })
                    }
                    required={false}
                    compact
                  />
                </div>
                {exceeds ? (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    Exceeds available stock
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {visibleProducts.length > 0 ? (
        <>
          {/* Spacer so the last product cards clear the fixed action bar */}
          <div
            className={
              isCollect
                ? "h-28 lg:h-24"
                : isOut
                  ? "h-72 lg:h-64"
                  : "h-44 lg:h-40"
            }
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-20 z-20 px-4 sm:bottom-24 sm:px-6 lg:bottom-4 lg:left-20 lg:px-8">
            <div className="space-y-3 rounded-2xl border-2 border-stone-200 bg-white/95 p-4 shadow-lg shadow-stone-900/15 backdrop-blur sm:p-5">
              {isOut ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-base font-semibold text-stone-700">
                        Client name
                      </label>
                      <input
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="form-input mt-2"
                        placeholder="Who is buying?"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-stone-700">
                        Invoice number (optional)
                      </label>
                      <input
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="form-input mt-2"
                        placeholder="Leave blank if unknown"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <label className="block text-base font-semibold text-stone-700">
                    Notes (optional)
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="form-input mt-2"
                    placeholder="Delivery note, remarks, etc."
                    disabled={submitting}
                  />
                </>
              ) : null}
              {!isCollect && !isOut ? (
                <>
                  <label className="block text-base font-semibold text-stone-700">
                    Notes (optional)
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="form-input mt-2"
                    placeholder="Purchase receipt, batch number, etc."
                    disabled={submitting}
                  />
                </>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm font-medium text-stone-500">
                  {filledItems.length > 0
                    ? `${filledItems.length} product${filledItems.length === 1 ? "" : "s"} ready`
                    : "Enter a quantity on at least one product"}
                </p>
                <Button
                  type="button"
                  size="xl"
                  loading={submitting}
                  disabled={saveDisabled}
                  className="w-full shrink-0 sm:w-auto sm:min-w-[14rem]"
                  onClick={() => void handleSave()}
                >
                  {buttonLabel}
                  {filledItems.length > 0 ? ` (${filledItems.length})` : ""}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
