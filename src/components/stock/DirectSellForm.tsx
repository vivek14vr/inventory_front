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
import { productSelectionGridItem } from "@/lib/products/productSelectionGrid";
import { useWarehouseProductBalances } from "@/hooks/useWarehouseProductBalances";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { StockQuantityEntry } from "@/components/stock/StockQuantityEntry";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Brand, Product, Warehouse } from "@/types/master";

type DirectSellStep = "warehouse" | "cart" | "addBrand" | "addProduct" | "addQuantity";

type SaleLine = {
  id: string;
  brandId: string;
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(pickWarehouse);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [addBrandId, setAddBrandId] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [addQuantityMode, setAddQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [productSearch, setProductSearch] = useState("");

  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState("");

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
  const selectedAddBrand = brands.find((b) => b.id === addBrandId);
  const selectedAddProduct = products.find((p) => p.id === addProductId);
  const filteredProducts = products.filter(
    (p) => p.isActive && matchesProductSearch(p, productSearch)
  );
  const fetchProductSuggestions = useMemo(
    () => createBrandProductSuggestions(products),
    [products]
  );
  const existingProductIds = useMemo(
    () => new Set(saleLines.map((line) => line.productId)),
    [saleLines]
  );
  const { loading: loadingProductBalances, quantityFor, error: availabilityError } =
    useWarehouseProductBalances(resolvedWarehouseId, {
      enabled: step === "addProduct",
      brandId: addBrandId,
    });

  useEffect(() => {
    setLoadingWarehouses(true);
    setError("");
    api.warehouses
      .list()
      .then(setWarehouses)
      .catch((err) => {
        setWarehouses([]);
        setError(err instanceof ApiError ? err.message : "Could not load warehouses");
      })
      .finally(() => setLoadingWarehouses(false));
  }, []);

  useEffect(() => {
    if (step === "cart" || step === "addBrand" || step === "addProduct" || step === "addQuantity") {
      setLoadingBrands(true);
      api.brands
        .list()
        .then(setBrands)
        .catch((err) => {
          setBrands([]);
          setError(err instanceof ApiError ? err.message : "Could not load brands");
        })
        .finally(() => setLoadingBrands(false));
    }
  }, [step]);

  useEffect(() => {
    if (!addBrandId) {
      setProducts([]);
      return;
    }
    setLoadingProducts(true);
    api.products
      .listAll({ brandId: addBrandId })
      .then(setProducts)
      .catch((err) => {
        setProducts([]);
        setError(err instanceof ApiError ? err.message : "Could not load products");
      })
      .finally(() => setLoadingProducts(false));
  }, [addBrandId]);

  useEffect(() => {
    if (step !== "addQuantity" || !resolvedWarehouseId || !addProductId) {
      setCurrentBalance(null);
      setBalanceError("");
      return;
    }
    let cancelled = false;
    setLoadingBalance(true);
    setBalanceError("");
    api.stock
      .balances({ warehouseId: resolvedWarehouseId, productId: addProductId })
      .then((result) => {
        if (!cancelled) {
          setCurrentBalance(result.items[0]?.quantity ?? 0);
          setBalanceError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCurrentBalance(null);
          setBalanceError(
            err instanceof ApiError ? err.message : "Could not load stock level"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBalance(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, resolvedWarehouseId, addProductId]);

  const addEnteredBaseQty = useMemo(() => {
    const entered = parseInt(addQuantity, 10);
    if (!Number.isFinite(entered) || entered <= 0) return 0;
    return quantityEntryToBase(entered, addQuantityMode, selectedAddProduct);
  }, [addQuantity, addQuantityMode, selectedAddProduct]);

  const addExceedsAvailable =
    currentBalance !== null && addEnteredBaseQty > 0 && addEnteredBaseQty > currentBalance;
  const cannotAddQuantity =
    step === "addQuantity" && (loadingBalance || currentBalance === null || Boolean(balanceError));

  function selectWarehouse(id: string) {
    setWarehouseId(id);
    setStep("cart");
  }

  function startAddProduct() {
    setAddBrandId("");
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setProductSearch("");
    setStep("addBrand");
  }

  function selectAddBrand(id: string) {
    setAddBrandId(id);
    setAddProductId("");
    setProductSearch("");
    setStep("addProduct");
  }

  function selectAddProduct(id: string) {
    if (existingProductIds.has(id)) {
      setError("This product is already on the sale");
      return;
    }
    setError("");
    setAddProductId(id);
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setStep("addQuantity");
  }

  function confirmAddProduct() {
    if (!selectedAddProduct || !addBrandId) return;
    if (cannotAddQuantity || addExceedsAvailable || addEnteredBaseQty <= 0) return;

    setSaleLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        brandId: addBrandId,
        productId: selectedAddProduct.id,
        product: selectedAddProduct,
        quantity: addQuantity,
        quantityMode: addQuantityMode,
      },
    ]);
    setAddBrandId("");
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setProductSearch("");
    setStep("cart");
  }

  function removeLine(lineId: string) {
    setSaleLines((prev) => prev.filter((line) => line.id !== lineId));
  }

  function goBack() {
    setError("");
    if (step === "addQuantity") {
      setAddProductId("");
      setAddQuantity("");
      setStep("addProduct");
    } else if (step === "addProduct") {
      setAddBrandId("");
      setAddProductId("");
      setStep("addBrand");
    } else if (step === "addBrand") {
      setStep("cart");
    } else if (step === "cart" && pickWarehouse) {
      setStep("warehouse");
    }
  }

  const showBackButton =
    step === "addBrand" ||
    step === "addProduct" ||
    step === "addQuantity" ||
    (step === "cart" && pickWarehouse);

  function resetFlow() {
    setSaleLines([]);
    setClientName("");
    setInvoiceNumber("");
    setNotes("");
    setAddBrandId("");
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
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

    const invalid = items.find(({ baseQty }) => !Number.isFinite(baseQty) || baseQty <= 0);
    if (invalid) {
      setError(`Enter a valid quantity for ${invalid.line.product.name}`);
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
    ...(step === "addBrand" || step === "addProduct" || step === "addQuantity"
      ? [{ label: "Adding", value: selectedAddProduct?.name ?? selectedAddBrand?.name }]
      : [{ label: "Products", value: saleLines.length ? String(saleLines.length) : undefined }]),
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
              Add one or more products for the same client and invoice
              {selectedWarehouse ? ` · From ${selectedWarehouse.name}` : ""}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-base font-semibold text-stone-700">
                  Client name
                </label>
                <input
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="form-input mt-2"
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
                <Button type="button" size="sm" variant="secondary" onClick={startAddProduct}>
                  Add product
                </Button>
              </div>

              {saleLines.length === 0 ? (
                <p className="mt-3 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  No products yet. Add at least one product to record the sale.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {saleLines.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
                    >
                      <div>
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

      {step === "addBrand" && (
        <SelectionGrid
          title="Select brand"
          subtitle="Choose a brand for the next product"
          items={brands
            .filter((b) => b.isActive)
            .map((b) => ({ id: b.id, title: b.name }))}
          onSelect={selectAddBrand}
          loading={loadingBrands}
          emptyMessage="No brands found"
        />
      )}

      {step === "addProduct" && (
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
              selectAddProduct(suggestion.id);
            }}
            fetchSuggestions={fetchProductSuggestions}
            placeholder="Search primary or secondary name…"
            ariaLabel="Search products"
            inputClassName="form-input w-full"
            emptyMessage={(term) => `No products match “${term}”`}
          />
          <SelectionGrid
            title="Select product"
            subtitle={
              selectedAddBrand
                ? `Brand: ${selectedAddBrand.name}${
                    existingProductIds.size
                      ? " · Already on sale: hidden from list if selected"
                      : ""
                  }`
                : undefined
            }
            items={filteredProducts
              .filter((p) => !existingProductIds.has(p.id))
              .map((p) =>
                productSelectionGridItem(p, {
                  quantity: quantityFor(p.id),
                  loadingQuantity: loadingProductBalances,
                })
              )}
            onSelect={selectAddProduct}
            loading={loadingProducts || loadingProductBalances}
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : "No products for this brand"
            }
          />
        </div>
      )}

      {step === "addQuantity" && selectedAddProduct && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">Quantity</h2>
            <p className="mt-1 text-base text-stone-500">
              {selectedAddProduct.name}
              {selectedAddProduct.secondaryName?.trim()
                ? ` · ${selectedAddProduct.secondaryName}`
                : ""}
            </p>

            {resolvedWarehouseId ? (
              <div className="mt-5 rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-sm font-semibold text-stone-600">
                  Available at {selectedWarehouse?.name ?? "warehouse"}
                </p>
                <div className="mt-1 min-h-8">
                  {loadingBalance ? (
                    <LoadingSpinner />
                  ) : currentBalance !== null ? (
                    <StockQuantityDisplay
                      quantity={currentBalance}
                      stockUnit={selectedAddProduct.stockUnit}
                      unitsPerStockUnit={selectedAddProduct.unitsPerStockUnit}
                      baseUnit={selectedAddProduct.baseUnit}
                      size="lg"
                    />
                  ) : balanceError ? (
                    <p className="text-sm font-semibold text-red-600">{balanceError}</p>
                  ) : (
                    <p className="text-sm text-stone-500">Could not load stock level</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <StockQuantityEntry
                product={selectedAddProduct}
                quantity={addQuantity}
                onQuantityChange={setAddQuantity}
                mode={addQuantityMode}
                onModeChange={setAddQuantityMode}
              />
            </div>

            {addExceedsAvailable ? (
              <p className="mt-3 text-sm font-semibold text-red-600">
                Not enough stock. Available:{" "}
                {formatBaseQuantityWithStockUnit(currentBalance ?? 0, selectedAddProduct)}.
              </p>
            ) : null}

            <Button
              type="button"
              size="xl"
              disabled={addExceedsAvailable || cannotAddQuantity || addEnteredBaseQty <= 0}
              className="mt-6 w-full"
              onClick={confirmAddProduct}
            >
              Add to sale
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
