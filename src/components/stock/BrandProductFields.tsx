"use client";

import { useEffect, useState } from "react";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { api, ApiError } from "@/lib/api/client";
import type { Brand, Product } from "@/types/master";

type BrandProductFieldsProps = {
  brandId: string;
  productId: string;
  onBrandChange: (brandId: string) => void;
  onProductChange: (productId: string) => void;
  disabled?: boolean;
};

export function BrandProductFields({
  brandId,
  productId,
  onBrandChange,
  onProductChange,
  disabled,
}: BrandProductFieldsProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.brands
      .list()
      .then((list) => {
        setBrands(list);
        setLoadError("");
      })
      .catch((err) => {
        setBrands([]);
        setLoadError(err instanceof ApiError ? err.message : "Could not load brands");
      });
  }, []);

  useEffect(() => {
    if (!brandId) {
      setProducts([]);
      setLoadError("");
      return;
    }
    setLoadingProducts(true);
    setLoadError("");
    api.products
      .listAll({ brandId })
      .then((list) => {
        setProducts(list);
        if (list.length === 0) {
          setLoadError("No products for this brand. Create one under Products.");
        }
      })
      .catch((err) => {
        setProducts([]);
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load products"
        );
      })
      .finally(() => setLoadingProducts(false));
  }, [brandId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ButtonSelect
        label="Brand"
        value={brandId}
        disabled={disabled}
        onChange={(id) => {
          onBrandChange(id);
          onProductChange("");
        }}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        emptyMessage="No brands available"
      />
      <div>
        <ButtonSelect
          label="Product"
          value={productId}
          disabled={disabled || !brandId || loadingProducts}
          onChange={onProductChange}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          emptyMessage={
            loadingProducts
              ? "Loading…"
              : brandId
                ? "No products for this brand"
                : "Select a brand first"
          }
        />
        {loadError && (
          <p className="mt-1 text-xs text-amber-700">{loadError}</p>
        )}
        {!loadError && brandId && !loadingProducts && products.length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            {products.length} product{products.length === 1 ? "" : "s"} available
          </p>
        )}
      </div>
    </div>
  );
}
