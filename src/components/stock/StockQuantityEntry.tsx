"use client";

import type { Product } from "@/types/master";
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
  product?: Product | null;
  quantity: string;
  onQuantityChange: (value: string) => void;
  mode: QuantityEntryMode;
  onModeChange: (mode: QuantityEntryMode) => void;
  disabled?: boolean;
  showToggle?: boolean;
};

export function StockQuantityEntry({
  product,
  quantity,
  onQuantityChange,
  mode,
  onModeChange,
  disabled,
  showToggle = true,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="block text-base font-semibold text-stone-700">
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
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
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
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
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
        <p className="mt-1 text-sm text-orange-700">{formatStockUnitHint(product)}</p>
      ) : null}
      <input
        type="number"
        min={1}
        required
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
        disabled={disabled}
        readOnly={disabled}
        className="form-input mt-2 text-2xl font-bold"
        placeholder="0"
      />
      {preview ? (
        <p className="mt-2 text-sm font-semibold text-stone-600">{preview}</p>
      ) : null}
    </div>
  );
}
