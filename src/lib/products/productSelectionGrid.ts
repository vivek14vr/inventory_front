import type { SelectionGridItem } from "@/components/ui/SelectionGrid";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
} from "@/lib/products/productUnits";
import { productPickerSubtitle } from "@/lib/products/productNames";
import type { Product } from "@/types/master";

function formatAvailableQuantity(
  baseQty: number,
  product: Product
): string {
  if (baseQty <= 0) {
    return formatBaseUnits(0, product);
  }
  return formatBaseQuantityWithStockUnit(baseQty, product);
}

export function productSelectionGridItem(
  product: Product,
  options?: {
    quantity?: number;
    loadingQuantity?: boolean;
  }
): SelectionGridItem {
  let detail: string | undefined;
  if (options?.loadingQuantity) {
    detail = "Loading stock…";
  } else if (options?.quantity !== undefined) {
    detail = `Available: ${formatAvailableQuantity(options.quantity, product)}`;
  }

  return {
    id: product.id,
    title: product.name,
    subtitle: productPickerSubtitle(product),
    detail,
  };
}
