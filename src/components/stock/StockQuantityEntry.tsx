"use client";

import type { ProductUnitFields } from "@/lib/products/productUnits";
import {
  formatQuantityEntryPreview,
  formatStockUnitHint,
  getBaseUnitLabel,
  getStockUnitLabel,
  pluralizeStockUnit,
  quantityEntryLabel,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";

type StockQuantityEntryProps = {
  product?: Partial<ProductUnitFields> | null;
  quantity: string;
  onQuantityChange: (value: string) => void;
  mode: QuantityEntryMode;
  onModeChange: (mode: QuantityEntryMode) => void;
  disabled?: boolean;
  showToggle?: boolean;
  /** When false, empty quantity is allowed (e.g. quick stock-in grids). Default true. */
  required?: boolean;
  /** Smaller controls for product cards. */
  compact?: boolean;
};

export function StockQuantityEntry({
  product,
  quantity,
  onQuantityChange,
  mode,
  onModeChange,
  disabled,
  showToggle = true,
  required = true,
  compact = false,
}: StockQuantityEntryProps) {
  const canToggle = showToggle && usesStockUnit(product);
  const entered = parseInt(quantity, 10);
  const preview = formatQuantityEntryPreview(entered, mode, product);
  const stockUnitLabel = pluralizeStockUnit(getStockUnitLabel(product), 2);
  const baseUnitLabel = pluralizeStockUnit(getBaseUnitLabel(product), 2);

  function switchMode(next: QuantityEntryMode) {
    if (next === mode) return;
    onModeChange(next);
    onQuantityChange("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          className={`block font-semibold text-stone-700 ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {quantityEntryLabel(mode, product)}
        </label>
        {canToggle ? (
          <div
            className="inline-flex rounded-xl border-2 border-stone-200 bg-stone-50 p-1"
            role="group"
            aria-label="Enter quantity as"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("stockUnit")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:py-1.5 sm:text-sm ${
                mode === "stockUnit"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-stone-600 hover:bg-white"
              }`}
            >
              {stockUnitLabel}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("units")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:py-1.5 sm:text-sm ${
                mode === "units"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-stone-600 hover:bg-white"
              }`}
            >
              {baseUnitLabel}
            </button>
          </div>
        ) : null}
      </div>
      {formatStockUnitHint(product) && canToggle ? (
        <p className={`mt-1 text-orange-700 ${compact ? "text-xs" : "text-sm"}`}>
          {formatStockUnitHint(product)}
        </p>
      ) : null}
      <input
        type="number"
        min={1}
        required={required}
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
        disabled={disabled}
        readOnly={disabled}
        className={`form-input mt-2 font-bold ${
          compact ? "text-xl" : "text-2xl"
        }`}
        placeholder="0"
      />
      {preview ? (
        <p
          className={`mt-2 font-semibold text-stone-600 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {preview}
        </p>
      ) : null}
    </div>
  );
}
