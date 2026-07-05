import type { Product } from "@/types/master";

export type ProductUnitFields = Pick<Product, "stockUnit" | "unitsPerStockUnit" | "baseUnit">;

export function getBaseUnitLabel(product?: Partial<ProductUnitFields> | null): string {
  const label = product?.baseUnit?.trim();
  return label || "piece";
}

export function getUnitsPerStockUnit(
  product?: Partial<ProductUnitFields> | null
): number {
  const n = product?.unitsPerStockUnit;
  return n && n > 0 ? n : 1;
}

export function getStockUnitLabel(product?: Partial<ProductUnitFields> | null): string {
  if (!usesStockUnit(product)) {
    return getBaseUnitLabel(product);
  }
  const label = product?.stockUnit?.trim();
  return label || "unit";
}

export function usesStockUnit(product?: Partial<ProductUnitFields> | null): boolean {
  return getUnitsPerStockUnit(product) > 1;
}

/** Convert entered stock-unit count (e.g. cartons) to base inventory units. */
export function stockUnitsToBase(
  entered: number,
  product?: Partial<ProductUnitFields> | null
): number {
  return entered * getUnitsPerStockUnit(product);
}

export function pluralizeStockUnit(label: string, count: number): string {
  if (count === 1) return label;
  const lower = label.toLowerCase();
  if (lower.endsWith("s")) return label;
  if (/(x|ch|sh|ss|z)$/.test(lower)) return `${label}es`;
  if (/[^aeiou]y$/.test(lower)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

export function formatBaseUnits(
  qty: number,
  product?: Partial<ProductUnitFields> | null
): string {
  const label = pluralizeStockUnit(getBaseUnitLabel(product), qty);
  return `${qty.toLocaleString()} ${label}`;
}

export function formatProductUnitSummary(
  product?: Partial<ProductUnitFields> | null
): string {
  if (!product) return "";
  if (!usesStockUnit(product)) {
    return `Per ${getBaseUnitLabel(product)}`;
  }
  const per = getUnitsPerStockUnit(product);
  const base = pluralizeStockUnit(getBaseUnitLabel(product), per);
  return `${per} ${base} = 1 ${getStockUnitLabel(product)}`;
}

export function stockUnitQuestionLabel(
  product?: Partial<ProductUnitFields> | null
): string {
  if (!usesStockUnit(product)) {
    return `How many ${pluralizeStockUnit(getBaseUnitLabel(product), 2)}?`;
  }
  return `How many ${pluralizeStockUnit(getStockUnitLabel(product), 2)}?`;
}

export function formatStockUnitHint(
  product?: Partial<ProductUnitFields> | null
): string | null {
  if (!usesStockUnit(product)) return null;
  const per = getUnitsPerStockUnit(product);
  const base = pluralizeStockUnit(getBaseUnitLabel(product), per);
  const label = getStockUnitLabel(product);
  return `${per} ${base} = 1 ${label}`;
}

export type QuantityEntryMode = "stockUnit" | "units";

export function quantityEntryToBase(
  entered: number,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): number {
  if (!Number.isFinite(entered) || entered <= 0) return 0;
  if (mode === "units" || !usesStockUnit(product)) {
    return Math.floor(entered);
  }
  return stockUnitsToBase(entered, product);
}

export function formatUnitsEntryPreview(
  entered: number,
  product?: Partial<ProductUnitFields> | null
): string | null {
  if (!usesStockUnit(product) || !Number.isFinite(entered) || entered <= 0) {
    return null;
  }
  const split = splitBaseQuantity(entered, product);
  const boxLabel = pluralizeStockUnit(split.unitLabel, split.fullUnits);
  let boxPart = `${split.fullUnits.toLocaleString()} ${boxLabel}`;
  if (split.loose > 0) {
    boxPart += ` + ${formatBaseUnits(split.loose, product)}`;
  }
  return `${entered.toLocaleString()} ${pluralizeStockUnit(getBaseUnitLabel(product), entered)} = ${boxPart}`;
}

export function formatQuantityEntryPreview(
  entered: number,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): string | null {
  if (!Number.isFinite(entered) || entered <= 0) return null;
  if (mode === "units") {
    return formatUnitsEntryPreview(entered, product);
  }
  return formatEnteredQuantityPreview(entered, product);
}

export function quantityEntryLabel(
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): string {
  if (mode === "units" && usesStockUnit(product)) {
    return `How many ${pluralizeStockUnit(getBaseUnitLabel(product), 2)}?`;
  }
  return stockUnitQuestionLabel(product);
}

export function formatEnteredQuantityPreview(
  entered: number,
  product?: Partial<ProductUnitFields> | null
): string | null {
  if (!usesStockUnit(product) || !Number.isFinite(entered) || entered <= 0) {
    return null;
  }
  const base = stockUnitsToBase(entered, product);
  const label = pluralizeStockUnit(getStockUnitLabel(product), entered);
  const baseLabel = pluralizeStockUnit(getBaseUnitLabel(product), base);
  return `${entered} ${label} = ${base.toLocaleString()} ${baseLabel}`;
}

export function splitBaseQuantity(
  baseQty: number,
  product?: Partial<ProductUnitFields> | null
): {
  fullUnits: number;
  loose: number;
  usesStockUnit: boolean;
  unitLabel: string;
  baseUnitLabel: string;
  perUnit: number;
} {
  const per = getUnitsPerStockUnit(product);
  const unitLabel = getStockUnitLabel(product);
  const baseUnitLabel = getBaseUnitLabel(product);
  const uses = usesStockUnit(product);
  const safeQty = Math.max(0, baseQty);

  if (!uses) {
    return {
      fullUnits: safeQty,
      loose: 0,
      usesStockUnit: false,
      unitLabel,
      baseUnitLabel,
      perUnit: 1,
    };
  }

  return {
    fullUnits: Math.floor(safeQty / per),
    loose: safeQty % per,
    usesStockUnit: true,
    unitLabel,
    baseUnitLabel,
    perUnit: per,
  };
}

/** Convert full stock units + loose base units to base inventory quantity. */
export function stockUnitsAndLooseToBase(
  fullUnits: number,
  loose: number,
  product?: Partial<ProductUnitFields> | null
): number {
  const per = getUnitsPerStockUnit(product);
  return Math.max(0, fullUnits) * per + Math.max(0, loose);
}

export function thresholdBaseToDisplay(
  base: number | null | undefined,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): string {
  if (base == null || !Number.isFinite(base) || base < 0) return "";
  if (mode === "units" || !usesStockUnit(product)) return String(base);
  const per = getUnitsPerStockUnit(product);
  const boxes = base / per;
  if (Number.isInteger(boxes)) return String(boxes);
  return String(Number(boxes.toFixed(4)));
}

export function thresholdDisplayToBase(
  display: string,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): number | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const entered =
    mode === "stockUnit" && usesStockUnit(product)
      ? parseFloat(trimmed)
      : parseInt(trimmed, 10);
  if (!Number.isFinite(entered) || entered < 0) return null;
  if (mode === "units" || !usesStockUnit(product)) return Math.floor(entered);
  return Math.floor(stockUnitsToBase(entered, product));
}

export function formatThresholdPreview(
  display: string,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): string | null {
  const base = thresholdDisplayToBase(display, mode, product);
  if (base == null || base <= 0) return null;
  if (mode === "units" && usesStockUnit(product)) {
    return formatUnitsEntryPreview(base, product);
  }
  if (mode === "stockUnit" && usesStockUnit(product)) {
    return formatEnteredQuantityPreview(parseFloat(display) || 0, product);
  }
  return null;
}

export function formatBaseQuantityWithStockUnit(
  baseQty: number,
  product?: Partial<ProductUnitFields> | null
): string {
  const split = splitBaseQuantity(baseQty, product);
  if (!split.usesStockUnit) {
    return formatBaseUnits(baseQty, product);
  }
  const packLabel = pluralizeStockUnit(split.unitLabel, split.fullUnits);
  const packPart = `${split.fullUnits.toLocaleString()} ${packLabel}`;
  if (split.loose > 0) {
    return `${packPart} + ${formatBaseUnits(split.loose, product)}`;
  }
  return packPart;
}

/** Compact threshold label for tables (respects cartons vs pieces toggle). */
export function formatListLowStockThreshold(
  baseQty: number,
  mode: QuantityEntryMode,
  product?: Partial<ProductUnitFields> | null
): string {
  if (mode === "stockUnit" && usesStockUnit(product)) {
    const display = thresholdBaseToDisplay(baseQty, mode, product);
    const n = parseFloat(display) || 0;
    return `${display} ${pluralizeStockUnit(getStockUnitLabel(product), n)}`;
  }
  return formatBaseUnits(baseQty, product);
}
