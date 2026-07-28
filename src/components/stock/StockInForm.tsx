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
import { productDisplayName } from "@/lib/products/productDisplayName";
import {
  formatBaseQuantityWithStockUnit,
  quantityEntryToBase,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { matchesProductSearch } from "@/lib/products/productNames";
import { validatePositiveInteger } from "@/lib/validation/quantity";
import { productSelectionGridItem } from "@/lib/products/productSelectionGrid";
import { useWarehouseProductBalances } from "@/hooks/useWarehouseProductBalances";
import { StockQuantityEntry } from "@/components/stock/StockQuantityEntry";
import { ProductQuickStockGrid } from "@/components/stock/ProductQuickStockGrid";
import type { Brand, Product, Warehouse } from "@/types/master";
import type { PendingTransfer } from "@/types/stock";

type StockInStep =
  | "warehouse"
  | "brand"
  | "cart"
  | "addProduct"
  | "addQuantity"
  | "product"
  | "confirm";

type StockInLine = {
  id: string;
  productId: string;
  product: Product;
  quantity: string;
  quantityMode: QuantityEntryMode;
};

type StockInFormProps = {
  requireWarehouse?: boolean;
  transfer?: PendingTransfer;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  returnMode?: "client" | "warehouse";
  onSuccess?: (message: string) => void;
  onBack?: () => void;
};

function newLineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function StockInForm({
  requireWarehouse = false,
  transfer,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  returnMode,
  onSuccess,
  onBack,
}: StockInFormProps) {
  const pickWarehouse = shouldPickWarehouse({ requireWarehouse, allowedWarehouseIds, transfer });
  const multiMode = !transfer && !returnMode;

  const [step, setStep] = useState<StockInStep>(() => {
    if (transfer) return "confirm";
    return pickWarehouse ? "warehouse" : "brand";
  });

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [loadingBrands, setLoadingBrands] = useState(!pickWarehouse);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [warehouseId, setWarehouseId] = useState(
    transfer?.destinationWarehouse?.id ?? defaultWarehouseId
  );
  const [brandId, setBrandId] = useState(transfer?.brand.id ?? "");
  const [productId, setProductId] = useState(transfer?.product.id ?? "");
  const [lines, setLines] = useState<StockInLine[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [addQuantityMode, setAddQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [quantity, setQuantity] = useState(transfer ? String(transfer.quantity) : "");
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
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
  const selectedProduct = products.find((p) => p.id === productId);
  const selectedAddProduct = products.find((p) => p.id === addProductId);
  const existingProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId)),
    [lines]
  );
  const filteredProducts = products.filter(
    (p) => p.isActive && matchesProductSearch(p, productSearch)
  );
  const fetchProductSuggestions = useMemo(
    () => createBrandProductSuggestions(products),
    [products]
  );
  const { loading: loadingProductBalances, quantityFor, error: availabilityError } =
    useWarehouseProductBalances(resolvedWarehouseId, {
      enabled: step === "product" || step === "addProduct",
      brandId,
    });

  const addEnteredBaseQty = useMemo(() => {
    const entered = parseInt(addQuantity, 10);
    if (!Number.isFinite(entered) || entered <= 0) return 0;
    return quantityEntryToBase(entered, addQuantityMode, selectedAddProduct);
  }, [addQuantity, addQuantityMode, selectedAddProduct]);

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
    if (
      step !== "brand" &&
      step !== "cart" &&
      step !== "addProduct" &&
      step !== "product"
    ) {
      return;
    }
    let cancelled = false;
    setLoadingBrands(true);
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
    setBrandId("");
    setProductId("");
    setLines([]);
    setStep("brand");
  }

  function selectBrand(id: string) {
    setBrandId(id);
    setProductId("");
    setProductSearch("");
    setLines([]);
    setAddProductId("");
    setAddQuantity("");
    setError("");
    setSuccess("");
    setStep("product");
  }

  function startAddProduct() {
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setProductSearch("");
    setStep("addProduct");
  }

  function selectAddProduct(id: string) {
    if (existingProductIds.has(id)) {
      setError("This product is already on the list");
      return;
    }
    setError("");
    setAddProductId(id);
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setStep("addQuantity");
  }

  function confirmAddProduct() {
    if (!selectedAddProduct || !brandId) return;
    if (existingProductIds.has(selectedAddProduct.id)) {
      setError("This product is already on the list");
      setStep("cart");
      return;
    }
    const qtyError = validatePositiveInteger(addEnteredBaseQty);
    if (qtyError) {
      setError(qtyError);
      return;
    }
    setLines((prev) => {
      if (prev.some((line) => line.productId === selectedAddProduct.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: newLineId(),
          productId: selectedAddProduct.id,
          product: selectedAddProduct,
          quantity: addQuantity,
          quantityMode: addQuantityMode,
        },
      ];
    });
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setProductSearch("");
    setError("");
    setStep("cart");
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((line) => line.id !== lineId));
  }

  function selectProduct(id: string) {
    setProductId(id);
    setQuantity("");
    setQuantityMode("stockUnit");
    setStep("confirm");
  }

  function goBack() {
    setError("");
    if (step === "addQuantity") {
      setAddProductId("");
      setAddQuantity("");
      setStep("addProduct");
    } else if (step === "addProduct") {
      setStep("cart");
    } else if (step === "cart") {
      setBrandId("");
      setLines([]);
      setStep("brand");
    } else if (step === "confirm" && !transfer) {
      setProductId("");
      setStep("product");
    } else if (step === "product") {
      setBrandId("");
      setProductId("");
      setStep("brand");
    } else if (step === "brand" && pickWarehouse) {
      setWarehouseId("");
      setBrandId("");
      setProductId("");
      setLines([]);
      setStep("warehouse");
    }
  }

  function handleBack() {
    if (step === "confirm") {
      if (!transfer) goBack();
      return;
    }
    if (
      step === "product" ||
      step === "cart" ||
      step === "addProduct" ||
      step === "addQuantity" ||
      (step === "brand" && pickWarehouse)
    ) {
      goBack();
      return;
    }
    onBack?.();
  }

  const showBackButton =
    (step === "confirm" && !transfer) ||
    step === "product" ||
    step === "cart" ||
    step === "addProduct" ||
    step === "addQuantity" ||
    (step === "brand" && pickWarehouse) ||
    (step === "warehouse" && !!onBack);

  function resetMultiFlow() {
    setLines([]);
    setBrandId("");
    setProductId("");
    setAddProductId("");
    setAddQuantity("");
    setAddQuantityMode("stockUnit");
    setNotes("");
    setProductSearch("");
    setStep(pickWarehouse ? "warehouse" : "brand");
    if (!pickWarehouse) {
      setWarehouseId(defaultWarehouseId);
    } else {
      setWarehouseId("");
    }
  }

  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!brandId) {
      setError("Select a brand");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one product");
      return;
    }

    const items = lines.map((line) => {
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
      const result = await api.stock.stockInBatch({
        ...(resolvedWarehouseId ? { warehouseId: resolvedWarehouseId } : {}),
        brandId,
        notes: notes.trim() || undefined,
        items: items.map(({ line, baseQty }) => ({
          productId: line.productId,
          quantity: baseQty,
        })),
      });
      const msg = `Stock added for ${result.brandName} · ${result.movements.length} product(s)`;
      setSuccess(msg);
      onSuccess?.(msg);
      resetMultiFlow();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record stock in");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const whId = transfer?.destinationWarehouse?.id ?? resolvedWarehouseId;
      const enteredQty = parseInt(quantity, 10);
      const baseQty = transfer
        ? enteredQty
        : quantityEntryToBase(enteredQty, quantityMode, selectedProduct);
      const qtyError = validatePositiveInteger(baseQty);
      if (qtyError) {
        setError(qtyError);
        setSubmitting(false);
        return;
      }
      const result = await api.stock.stockIn({
        ...(whId ? { warehouseId: whId } : {}),
        brandId,
        productId,
        quantity: baseQty,
        transferId: transfer?.id,
        clientName:
          returnMode === "client" ? clientName.trim() || undefined : undefined,
        invoiceNumber:
          returnMode === "client" ? invoiceNumber.trim() || undefined : undefined,
        notes: notes || undefined,
      });
      const balanceProduct = transfer?.product ?? selectedProduct;
      const formattedBalance = formatBaseQuantityWithStockUnit(result.balance, balanceProduct);
      const msg = transfer
        ? `Transfer received. New balance: ${formattedBalance}`
        : returnMode === "client"
          ? `Client return recorded. New balance: ${formattedBalance}`
          : returnMode === "warehouse"
            ? `Warehouse return recorded. New balance: ${formattedBalance}`
            : `Stock added. New balance: ${formattedBalance}`;
      setSuccess(msg);
      onSuccess?.(msg);
      if (!transfer) {
        setBrandId("");
        setProductId("");
        setQuantity("");
        setQuantityMode("stockUnit");
        setClientName("");
        setInvoiceNumber("");
        setNotes("");
        setStep(pickWarehouse ? "warehouse" : "brand");
        if (!pickWarehouse) {
          setWarehouseId(defaultWarehouseId);
        } else {
          setWarehouseId("");
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record stock in");
    } finally {
      setSubmitting(false);
    }
  }

  const flowSteps = [
    ...(pickWarehouse
      ? [{ label: "Warehouse", value: selectedWarehouse?.name }]
      : selectedWarehouse
        ? [{ label: "Warehouse", value: selectedWarehouse.name }]
        : []),
    { label: "Brand", value: selectedBrand?.name },
    {
      label: "Product",
      value: multiMode
        ? step === "product"
          ? selectedBrand?.name
            ? "Enter qty"
            : undefined
          : undefined
        : selectedProduct?.name,
    },
  ];

  return (
    <div className="space-y-5">
      {showBackButton && (
        <StockFlowBackButton onClick={handleBack} disabled={!!transfer && step === "confirm"} />
      )}
      <StockFlowBar steps={flowSteps} />
      <Alert message={error} />
      <Alert message={success} type="success" />

      {transfer && (
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 px-5 py-4 text-base text-orange-900">
          <p className="font-bold">Receiving transfer</p>
          <p className="mt-1 text-orange-800">
            {transfer.quantity} × {productDisplayName(transfer.product)} from{" "}
            {transfer.sourceWarehouse.name} ({transfer.sourceWarehouse.code})
          </p>
        </div>
      )}

      {step === "warehouse" && (
        <SelectionGrid
          title={returnMode ? "Return to which warehouse?" : "Select warehouse"}
          subtitle={
            returnMode
              ? "Where are you adding the returned stock?"
              : "Which warehouse are you adding stock to?"
          }
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

      {step === "brand" && (
        <SelectionGrid
          title="Select brand"
          subtitle={
            selectedWarehouse
              ? `Adding stock at ${selectedWarehouse.name}`
              : "Choose a brand"
          }
          items={brands
            .filter((b) => b.isActive)
            .map((b) => ({ id: b.id, title: b.name }))}
          onSelect={selectBrand}
          loading={loadingBrands}
          emptyMessage="No brands found. Add brands first."
        />
      )}

      {step === "product" && multiMode && (
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
            title="Select product"
            subtitle={
              selectedBrand
                ? `Brand: ${selectedBrand.name}${
                    selectedWarehouse ? ` · ${selectedWarehouse.name}` : ""
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
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : "No products for this brand. Add products first."
            }
            onSuccess={(msg) => {
              setError("");
              setSuccess(msg);
              onSuccess?.(msg);
            }}
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

      {step === "cart" && multiMode && (
        <form onSubmit={handleBatchSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">Stock in list</h2>
            <p className="mt-1 text-base text-stone-500">
              Add multiple products from{" "}
              <span className="font-semibold text-stone-700">
                {selectedBrand?.name ?? "this brand"}
              </span>
              {selectedWarehouse ? ` · ${selectedWarehouse.name}` : ""}
            </p>

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-stone-800">Products</h3>
                <Button type="button" size="sm" variant="secondary" onClick={startAddProduct}>
                  Add product
                </Button>
              </div>

              {lines.length === 0 ? (
                <p className="mt-3 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  No products yet. Add one or more products, then stock them in together.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {lines.map((line) => (
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
                placeholder="Purchase receipt, batch number, etc."
              />
            </div>

            <Button
              type="submit"
              size="xl"
              loading={submitting}
              disabled={lines.length === 0}
              className="mt-6 w-full"
            >
              Add stock ({lines.length} product{lines.length === 1 ? "" : "s"})
            </Button>
          </div>
        </form>
      )}

      {((step === "product" && !multiMode) || step === "addProduct") && (
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
              if (step === "addProduct") {
                selectAddProduct(suggestion.id);
              } else {
                selectProduct(suggestion.id);
              }
            }}
            fetchSuggestions={fetchProductSuggestions}
            placeholder="Search primary or secondary name…"
            ariaLabel="Search products"
            inputClassName="form-input w-full !pl-11"
            emptyMessage={(term) => `No products match “${term}”`}
          />
          <SelectionGrid
            title="Select product"
            subtitle={
              selectedBrand
                ? `Brand: ${selectedBrand.name} — stock adds to the same product for either name`
                : undefined
            }
            items={(step === "addProduct"
              ? filteredProducts.filter((p) => !existingProductIds.has(p.id))
              : filteredProducts
            ).map((p) =>
              productSelectionGridItem(p, {
                quantity: quantityFor(p.id),
                loadingQuantity: loadingProductBalances,
              })
            )}
            onSelect={step === "addProduct" ? selectAddProduct : selectProduct}
            loading={loadingProducts || loadingProductBalances}
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : "No products for this brand. Add products first."
            }
          />
        </div>
      )}

      {step === "addQuantity" && selectedAddProduct && (
        <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-bold text-stone-900">Enter quantity</h2>
          <p className="mt-1 text-base text-stone-500">
            {selectedAddProduct.name}
            {selectedAddProduct.secondaryName?.trim()
              ? ` · ${selectedAddProduct.secondaryName}`
              : ""}
            {selectedBrand ? ` · ${selectedBrand.name}` : ""}
            {selectedWarehouse ? ` · ${selectedWarehouse.name}` : ""}
          </p>

          <div className="mt-5">
            <StockQuantityEntry
              product={selectedAddProduct}
              quantity={addQuantity}
              onQuantityChange={setAddQuantity}
              mode={addQuantityMode}
              onModeChange={setAddQuantityMode}
            />
          </div>

          <Button
            type="button"
            size="xl"
            className="mt-6 w-full"
            disabled={addEnteredBaseQty <= 0}
            onClick={confirmAddProduct}
          >
            Add to list
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <form onSubmit={handleSingleSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">
              {returnMode ? "Return details" : "Enter quantity"}
            </h2>
            <p className="mt-1 text-base text-stone-500">
              {transfer
                ? productDisplayName(transfer.product)
                : selectedProduct?.name}
              {!transfer && selectedProduct?.secondaryName?.trim()
                ? ` · ${selectedProduct.secondaryName}`
                : ""}
              {selectedBrand ? ` · ${selectedBrand.name}` : ""}
              {selectedWarehouse ? ` · ${selectedWarehouse.name}` : ""}
            </p>

            <div className="mt-5 space-y-4">
              {returnMode === "client" && (
                <>
                  <div>
                    <label className="block text-base font-semibold text-stone-700">
                      Client name
                    </label>
                    <input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                      className="form-input mt-2"
                      placeholder="Who is returning the goods?"
                    />
                  </div>
                  <div>
                    <label className="block text-base font-semibold text-stone-700">
                      Invoice / reference (optional)
                    </label>
                    <input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="form-input mt-2"
                      placeholder="Original invoice or return note"
                    />
                  </div>
                </>
              )}

              <StockQuantityEntry
                product={transfer?.product ?? selectedProduct}
                quantity={quantity}
                onQuantityChange={setQuantity}
                mode={transfer ? "units" : quantityMode}
                onModeChange={setQuantityMode}
                disabled={!!transfer}
                showToggle={!transfer}
              />

              <div>
                <label className="block text-base font-semibold text-stone-700">
                  Notes (optional)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-input mt-2"
                  placeholder={
                    returnMode
                      ? "Condition of goods, reason for return, etc."
                      : "Purchase receipt, batch number, etc."
                  }
                />
              </div>
            </div>

            <Button type="submit" size="xl" loading={submitting} className="mt-6 w-full">
              {transfer
                ? "Confirm receive"
                : returnMode
                  ? "Record return"
                  : "Add stock"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
