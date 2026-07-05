export function productDisplayName(product: {
  name?: string;
  productName?: string;
  secondaryName?: string | null;
  secondaryProductName?: string | null;
}): string {
  const primary = (product.name ?? product.productName ?? "").trim();
  const secondary = (product.secondaryName ?? product.secondaryProductName)?.trim();
  return secondary ? `${primary} (${secondary})` : primary;
}
