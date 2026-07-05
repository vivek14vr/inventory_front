import { api } from "@/lib/api/client";
import type { SearchSuggestion } from "@/components/search/SearchInputWithSuggestions";
import type { Product } from "@/types/master";
import { matchesProductSearch, productPickerSubtitle } from "@/lib/products/productNames";

type ProductSuggestionOptions = {
  brandId?: string;
  warehouseId?: string;
  includeInactive?: boolean;
};

function toProductSuggestion(item: {
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandName: string;
  quantity: number;
  quantityScope: "total" | "warehouse";
}): SearchSuggestion {
  const quantityLabel =
    item.quantityScope === "warehouse"
      ? `${item.quantity.toLocaleString()} units`
      : `${item.quantity.toLocaleString()} units total`;

  return {
    id: item.productId,
    title: item.productName,
    subtitle: item.secondaryProductName,
    badge: item.brandName,
    meta: quantityLabel,
    searchTerm: item.productName,
  };
}

async function fetchProductSuggestions(
  term: string,
  options?: ProductSuggestionOptions
): Promise<SearchSuggestion[]> {
  const result = await api.search.productSuggestions({
    search: term,
    limit: 8,
    ...(options?.brandId ? { brandId: options.brandId } : {}),
    ...(options?.warehouseId ? { warehouseId: options.warehouseId } : {}),
    ...(options?.includeInactive ? { includeInactive: true } : {}),
  });

  return result.items.map(toProductSuggestion);
}

export function createAdminInventoryProductSuggestions(warehouseId?: string) {
  return (term: string) =>
    fetchProductSuggestions(term, { warehouseId: warehouseId || undefined });
}

export function createAppInventoryProductSuggestions(warehouseId?: string) {
  return (term: string) =>
    fetchProductSuggestions(term, { warehouseId: warehouseId || undefined });
}

export function createAdminProductsPageSuggestions(brandId?: string) {
  return (term: string) =>
    fetchProductSuggestions(term, {
      brandId: brandId || undefined,
      includeInactive: true,
    }).then((items) =>
      items.map((item) => ({
        ...item,
        meta: undefined,
      }))
    );
}

export function createBrandProductSuggestions(products: Product[]) {
  return async (term: string): Promise<SearchSuggestion[]> => {
    return products
      .filter((product) => product.isActive && matchesProductSearch(product, term))
      .slice(0, 8)
      .map((product) => ({
        id: product.id,
        title: product.name,
        subtitle: productPickerSubtitle(product),
        searchTerm: product.name,
      }));
  };
}

export async function fetchInvoiceSearchSuggestions(
  term: string
): Promise<SearchSuggestion[]> {
  const result = await api.search.invoiceSuggestions({ search: term, limit: 8 });

  return result.items.map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    badge:
      item.kind === "invoice"
        ? "Invoice"
        : item.kind === "client"
          ? "Client"
          : "Product",
    searchTerm: item.searchTerm,
  }));
}

// Backward-compatible exports for home page search bars.
export async function fetchAdminProductSearchSuggestions(term: string) {
  return fetchProductSuggestions(term);
}

export async function fetchAppProductSearchSuggestions(term: string) {
  return fetchProductSuggestions(term);
}
