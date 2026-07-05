import type { Product } from "@/types/master";
import { formatProductUnitSummary } from "@/lib/products/productUnits";

export function formatSecondaryName(value?: string | null): string {
  const text = value?.trim();
  return text || "—";
}

export function productPickerSubtitle(
  product: Pick<Product, "secondaryName" | "stockUnit" | "unitsPerStockUnit" | "baseUnit">
): string | undefined {
  const parts: string[] = [];
  if (product.secondaryName?.trim()) {
    parts.push(product.secondaryName.trim());
  }
  const unitSummary = formatProductUnitSummary(product);
  if (unitSummary) {
    parts.push(unitSummary);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function matchesProductSearch(
  product: Pick<Product, "name" | "secondaryName">,
  term: string
): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  if (product.name.toLowerCase().includes(query)) return true;
  if (product.secondaryName?.toLowerCase().includes(query)) return true;
  return false;
}
