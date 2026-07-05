"use client";

import type { ProductUnitFields, QuantityEntryMode } from "@/lib/products/productUnits";
import {
  getBaseUnitLabel,
  getStockUnitLabel,
  pluralizeStockUnit,
  usesStockUnit,
} from "@/lib/products/productUnits";

type ThresholdUnitToggleProps = {
  mode: QuantityEntryMode;
  onModeChange: (mode: QuantityEntryMode) => void;
  product?: Partial<ProductUnitFields> | null;
  size?: "sm" | "md";
};

export function ThresholdUnitToggle({
  mode,
  onModeChange,
  product,
  size = "md",
}: ThresholdUnitToggleProps) {
  if (!usesStockUnit(product)) return null;

  const stockUnitLabel = pluralizeStockUnit(getStockUnitLabel(product), 2);
  const baseUnitLabel = pluralizeStockUnit(getBaseUnitLabel(product), 2);
  const buttonClass =
    size === "sm"
      ? "rounded-md px-2.5 py-1 text-xs font-semibold"
      : "rounded-lg px-3 py-1.5 text-sm font-semibold";

  return (
    <div
      className="inline-flex rounded-xl border-2 border-stone-200 bg-stone-50 p-1"
      role="group"
      aria-label="Enter low-stock threshold as"
    >
      <button
        type="button"
        onClick={() => onModeChange("stockUnit")}
        className={`${buttonClass} transition ${
          mode === "stockUnit"
            ? "bg-orange-600 text-white shadow-sm"
            : "text-stone-600 hover:bg-white"
        }`}
      >
        {stockUnitLabel}
      </button>
      <button
        type="button"
        onClick={() => onModeChange("units")}
        className={`${buttonClass} transition ${
          mode === "units"
            ? "bg-orange-600 text-white shadow-sm"
            : "text-stone-600 hover:bg-white"
        }`}
      >
        {baseUnitLabel}
      </button>
    </div>
  );
}
