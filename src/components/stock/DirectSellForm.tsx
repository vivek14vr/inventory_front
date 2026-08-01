"use client";

import { useEffect, useMemo, useState } from "react";
import { StockFlowBar, StockFlowBackButton } from "@/components/stock/StockFlowBar";
import { resolveWarehouseId, shouldPickWarehouse } from "@/components/stock/stockFlowUtils";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { SearchInputWithSuggestions } from "@/components/search/SearchInputWithSuggestions";
import { createBrandProductSuggestions } from "@/lib/search/productSearchSuggestions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api/client";
import {
  formatBaseQuantityWithStockUnit,
  quantityEntryToBase,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { matchesProductSearch } from "@/lib/products/productNames";
import { validatePositiveInteger } from "@/lib/validation/quantity";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useWarehouseProductBalances } from "@/hooks/useWarehouseProductBalances";
import {
  ProductQuickStockGrid,
  type CollectedStockItem,
} from "@/components/stock/ProductQuickStockGrid";
import type { Brand, Client, Product, Warehouse } from "@/types/master";

type DirectSellStep = "warehouse" | "cart" | "brand" | "product";

type SaleLine = {
  id: string;
  brandId: string;
  brandName: string;
  productId: string;
  product: Product;
  quantity: string;
  quantityMode: QuantityEntryMode;
};

type DirectSellFormProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  onSuccess?: (message: string) => void;
};

function newLineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DirectSellForm({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  onSuccess,
}: DirectSellFormProps) {
  const pickWarehouse = shouldPickWarehouse({ requireWarehouse, allowedWarehouseIds });

  const [step, setStep] = useState<DirectSellStep>(() =>
    pickWarehouse ? "warehouse" : "cart"
  );

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(pickWarehouse);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [brandId, setBrandId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch = useDebouncedValue(productSearch, 250);

  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resolvedWarehouseId = resolveWarehouseId(
    warehouseId,
    defaultWarehouseId,
    allowedWarehouseIds
  );

  const warehouseOptions = useMemo(() => {
    let list = warehouses;
    if (allowedWarehouseIds?.length) {
      list = list.filter((w) => allowedWarehouseIds.includes(w.id));
    }
    return list.filter((w) => w.isActive);
  }, [warehouses, allowedWarehouseIds]);

  const selectedWarehouse = warehouseOptions.find((w) => w.id === resolvedWarehouseId);
  const selectedBrand = brands.find((b) => b.id === brandId);
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) => p.isActive && matchesProductSearch(p, debouncedProductSearch)
      ),
    [products, debouncedProductSearch]
  );
  const fetchProductSuggestions = useMemo(
    () => createBrandProductSuggestions(products),
    [products]
  );
  const fetchClientSuggestions = useMemo(
    () => async (term: string) => {
      const normalized = term.trim().toLocaleLowerCase();
      return clients
        .filter(
          (client) =>
            client.isActive &&
            (client.name.toLocaleLowerCase().includes(normalized) ||
              client.secondaryName?.toLocaleLowerCase().includes(normalized))
        )
        .slice(0, 8)
        .map((client) => ({
          id: client.id,
          title: client.name,
          subtitle: client.secondaryName,
          badge: "Existing client",
          searchTerm: client.name,
        }));
    },
    [clients]
  );
  const existingProductIds = useMemo(
    () => new Set(saleLines.map((line) => line.productId)),
    [saleLines]
  );
  const { loading: loadingProductBalances, quantityFor, error: availabilityError } =
    useWarehouseProductBalances(resolvedWarehouseId, {
      enabled: step === "product",
      brandId,
    });

  useEffect(() => {
    let cancelled = false;
    setLoadingWarehouses(true);
    setError("");
    api.warehouses
      .list()
      .then((data) => {
        if (!cancelled) setWarehouses(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setWarehouses([]);
        setError(err instanceof ApiError ? err.message : "Could not load warehouses");
      })
      .finally(() => {
        if (!cancelled) setLoadingWarehouses(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.clients
      .list()
      .then((data) => {
        if (!cancelled) setClients(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setClients([]);
        setError(err instanceof ApiError ? err.message : "Could not load clients");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "brand" && step !== "product") return;
    let cancelled = false;
    setLoadingBrands(true);
    setError("");
    api.brands
      .list()
      .then((data) => {
        if (!cancelled) setBrands(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBrands([]);
        setError(err instanceof ApiError ? err.message : "Could not load brands");
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (!brandId) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    setError("");
    api.products
      .listAll({ brandId })
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setProducts([]);
        setError(err instanceof ApiError ? err.message : "Could not load products");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  function selectWarehouse(id: string) {
    setWarehouseId(id);
    setError("");
    setSuccess("");
    setStep("cart");
  }

  function startAddProducts() {
    setBrandId("");
    setProductSearch("");
    setError("");
    setStep("brand");
  }

  function selectBrand(id: string) {
    setBrandId(id);
    setProductSearch("");
    setError("");
    setStep("product");
  }

  function handleCollect(items: CollectedStockItem[]) {
    const brand = brands.find((b) => b.id === brandId);
    setSaleLines((prev) => {
      const next = [...prev];
      for (const item of items) {
        if (next.some((line) => line.productId === item.productId)) continue;
        next.push({
          id: newLineId(),
          brandId,
          brandName: brand?.name ?? "Brand",
          productId: item.productId,
          product: item.product,
          quantity: item.quantity,
          quantityMode: item.quantityMode,
        });
      }
      return next;
    });
    setBrandId("");
    setProductSearch("");
    setError("");
    setSuccess(
      `Added ${items.length} product${items.length === 1 ? "" : "s"} to the sale`
    );
    setStep("cart");
  }

  function removeLine(lineId: string) {
    setSaleLines((prev) => prev.filter((line) => line.id !== lineId));
  }

  function goBack() {
    setError("");
    if (step === "product") {
      setBrandId("");
      setProductSearch("");
      setStep("brand");
    } else if (step === "brand") {
      setStep("cart");
    } else if (step === "cart" && pickWarehouse) {
      setStep("warehouse");
    }
  }

  const showBackButton =
    step === "brand" ||
    step === "product" ||
    (step === "cart" && pickWarehouse);

  function resetFlow() {
    setSaleLines([]);
    setClientName("");
    setInvoiceNumber("");
    setNotes("");
    setBrandId("");
    setProductSearch("");
    setStep(pickWarehouse ? "warehouse" : "cart");
    if (!pickWarehouse) {
      setWarehouseId(defaultWarehouseId);
    } else {
      setWarehouseId("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (saleLines.length === 0) {
      setError("Add at least one product to the sale");
      return;
    }

    const items = saleLines.map((line) => {
      const entered = parseInt(line.quantity, 10);
      const baseQty = quantityEntryToBase(entered, line.quantityMode, line.product);
      return { line, baseQty };
    });

    const invalid = items.find(({ baseQty }) => validatePositiveInteger(baseQty));
    if (invalid) {
      setError(
        validatePositiveInteger(invalid.baseQty) ??
          `Enter a valid quantity for ${invalid.line.product.name}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.stock.stockOutBatch({
        ...(resolvedWarehouseId ? { warehouseId: resolvedWarehouseId } : {}),
        clientName: clientName.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map(({ line, baseQty }) => ({
          brandId: line.brandId,
          productId: line.productId,
          quantity: baseQty,
        })),
      });
      const invoicePart = result.invoiceNumber
        ? ` · Invoice ${result.invoiceNumber}`
        : "";
      const msg = `Sale recorded for ${result.clientName}${invoicePart} · ${result.movements.length} product(s)`;
      setSuccess(msg);
      onSuccess?.(msg);
      resetFlow();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record sale");
    } finally {
      setSubmitting(false);
    }
  }

  const flowSteps = [
    ...(pickWarehouse || selectedWarehouse
      ? [{ label: "From", value: selectedWarehouse?.name }]
      : []),
    { label: "Sale", value: clientName.trim() || undefined },
    ...(step === "brand" || step === "product"
      ? [
          {
            label: "Adding",
            value: selectedBrand?.name ?? "Brand",
          },
        ]
      : [
          {
            label: "Products",
            value: saleLines.length ? String(saleLines.length) : undefined,
          },
        ]),
  ];

  return (
    <div className="space-y-5">
      {showBackButton ? <StockFlowBackButton onClick={goBack} /> : null}
      <StockFlowBar steps={flowSteps} />
      <Alert message={error} />
      <Alert message={success} type="success" />

      {step === "warehouse" && (
        <SelectionGrid
          title="Select warehouse"
          subtitle="Which warehouse are you selling from?"
          items={warehouseOptions.map((w) => ({
            id: w.id,
            title: w.name,
            subtitle: w.code,
          }))}
          onSelect={selectWarehouse}
          loading={loadingWarehouses}
          emptyMessage="No warehouses available"
        />
      )}

      {step === "cart" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">Direct sale</h2>
            <p className="mt-1 text-base text-stone-500">
              Enter client details, then add products by brand
              {selectedWarehouse ? ` · From ${selectedWarehouse.name}` : ""}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-base font-semibold text-stone-700">
                  Client name
                </label>
                <SearchInputWithSuggestions
                  value={clientName}
                  onChange={setClientName}
                  onSelect={(suggestion) => setClientName(suggestion.searchTerm)}
                  fetchSuggestions={fetchClientSuggestions}
                  placeholder="Search existing clients or enter a new name…"
                  ariaLabel="Search or enter client name"
                  inputClassName="form-input mt-2 w-full"
                  debounceMs={150}
                  emptyMessage={(term) =>
                    `No existing client matches “${term}”. You can still use this name.`
                  }
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
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-stone-800">Products</h3>
                <Button type="button" size="sm" variant="secondary" onClick={startAddProducts}>
                  Add products
                </Button>
              </div>

              {saleLines.length === 0 ? (
                <p className="mt-3 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  No products yet. Add products from a brand, then add more brands if needed.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {saleLines.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                          {line.brandName}
                        </p>
                        <p className="font-semibold text-stone-900">{line.product.name}</p>
                        {line.product.secondaryName?.trim() ? (
                          <p className="text-sm text-stone-500">{line.product.secondaryName}</p>
                        ) : null}
                        <p className="mt-1 text-sm font-medium text-stone-600">
                          {formatBaseQuantityWithStockUnit(
                            quantityEntryToBase(
                              parseInt(line.quantity, 10),
                              line.quantityMode,
                              line.product
                            ),
                            line.product
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="!border-rose-200 !text-rose-800 hover:!bg-rose-50"
                        onClick={() => removeLine(line.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-base font-semibold text-stone-700">
                Notes (optional)
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input mt-2"
              />
            </div>

            <Button
              type="submit"
              size="xl"
              loading={submitting}
              disabled={saleLines.length === 0}
              className="mt-6 w-full"
            >
              Record sale ({saleLines.length} product{saleLines.length === 1 ? "" : "s"})
            </Button>
          </div>
        </form>
      )}

      {step === "brand" && (
        <SelectionGrid
          title="Select brand"
          subtitle="Choose a brand, enter quantities for its products, then add them to the sale"
          items={brands
            .filter((b) => b.isActive)
            .map((b) => ({ id: b.id, title: b.name }))}
          onSelect={selectBrand}
          loading={loadingBrands}
          emptyMessage="No brands found"
        />
      )}

      {step === "product" && (
        <div className="space-y-4">
          {availabilityError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {availabilityError}
            </p>
          ) : null}
          <SearchInputWithSuggestions
            value={productSearch}
            onChange={setProductSearch}
            onSelect={(suggestion) => {
              setProductSearch(suggestion.searchTerm);
            }}
            fetchSuggestions={fetchProductSuggestions}
            placeholder="Search primary or secondary name…"
            ariaLabel="Search products"
            inputClassName="form-input w-full !pl-11"
            emptyMessage={(term) => `No products match “${term}”`}
          />
          <ProductQuickStockGrid
            key={brandId}
            action="collect"
            title="Select product"
            subtitle={
              selectedBrand
                ? `Brand: ${selectedBrand.name}${
                    selectedWarehouse ? ` · From ${selectedWarehouse.name}` : ""
                  }`
                : undefined
            }
            products={filteredProducts}
            brandId={brandId}
            brandName={selectedBrand?.name}
            warehouseId={resolvedWarehouseId || undefined}
            loading={loadingProducts || loadingProductBalances}
            quantityFor={quantityFor}
            loadingQuantity={loadingProductBalances}
            excludeProductIds={existingProductIds}
            submitLabel="Add to sale"
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : existingProductIds.size > 0
                  ? "All products from this brand are already on the sale"
                  : "No products for this brand"
            }
            onCollect={handleCollect}
            onError={(msg) => {
              if (!msg) {
                setError("");
                return;
              }
              setSuccess("");
              setError(msg);
            }}
          />
        </div>
      )}
    </div>
  );
}
