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
import type { Brand, Product, Warehouse } from "@/types/master";
import type { PendingTransfer } from "@/types/stock";

type StockInStep = "warehouse" | "brand" | "product" | "confirm";

type StockInFormProps = {
  requireWarehouse?: boolean;
  transfer?: PendingTransfer;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  returnMode?: "client" | "warehouse";
  onSuccess?: (message: string) => void;
  onBack?: () => void;
};

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
  const filteredProducts = products.filter(
    (p) => p.isActive && matchesProductSearch(p, productSearch)
  );
  const fetchProductSuggestions = useMemo(
    () => createBrandProductSuggestions(products),
    [products]
  );
  const { loading: loadingProductBalances, quantityFor, error: availabilityError } =
    useWarehouseProductBalances(resolvedWarehouseId, { enabled: step === "product", brandId });

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
    if (step === "brand" || step === "product" || step === "confirm") {
      setLoadingBrands(true);
      setError("");
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
    if (!brandId) {
      setProducts([]);
      return;
    }
    setLoadingProducts(true);
    setError("");
    api.products
      .listAll({ brandId })
      .then(setProducts)
      .catch((err) => {
        setProducts([]);
        setError(err instanceof ApiError ? err.message : "Could not load products");
      })
      .finally(() => setLoadingProducts(false));
  }, [brandId]);

  function selectWarehouse(id: string) {
    setWarehouseId(id);
    setBrandId("");
    setProductId("");
    setStep("brand");
  }

  function selectBrand(id: string) {
    setBrandId(id);
    setProductId("");
    setProductSearch("");
    setStep("product");
  }

  function selectProduct(id: string) {
    setProductId(id);
    setQuantity("");
    setQuantityMode("stockUnit");
    setStep("confirm");
  }

  function goBack() {
    setError("");
    if (step === "confirm" && !transfer) {
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
      setStep("warehouse");
    }
  }

  function handleBack() {
    if (step === "confirm") {
      if (!transfer) goBack();
      return;
    }
    if (step === "product" || (step === "brand" && pickWarehouse)) {
      goBack();
      return;
    }
    onBack?.();
  }

  const showBackButton =
    (step === "confirm" && !transfer) ||
    step === "product" ||
    step === "brand" ||
    (step === "warehouse" && !!onBack);

  async function handleSubmit(e: React.FormEvent) {
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
    { label: "Product", value: selectedProduct?.name },
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
              selectProduct(suggestion.id);
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
            items={filteredProducts.map((p) =>
              productSelectionGridItem(p, {
                quantity: quantityFor(p.id),
                loadingQuantity: loadingProductBalances,
              })
            )}
            onSelect={selectProduct}
            loading={loadingProducts || loadingProductBalances}
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : "No products for this brand. Add products first."
            }
          />
        </div>
      )}

      {step === "confirm" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">
              {returnMode ? "Return details" : "Enter quantity"}
            </h2>
            <p className="mt-1 text-base text-stone-500">
              {selectedProduct?.name}
              {selectedProduct?.secondaryName?.trim()
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
                product={selectedProduct}
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

            <Button
              type="submit"
              size="xl"
              loading={submitting}
              className="mt-6 w-full"
            >
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
