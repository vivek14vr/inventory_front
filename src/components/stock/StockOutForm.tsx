"use client";

import { useEffect, useMemo, useState } from "react";
import { StockFlowBar } from "@/components/stock/StockFlowBar";
import { resolveWarehouseId, shouldPickWarehouse } from "@/components/stock/stockFlowUtils";
import { SelectionGrid } from "@/components/ui/SelectionGrid";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api/client";
import {
  formatBaseQuantityWithStockUnit,
  quantityEntryToBase,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import { matchesProductSearch, productPickerSubtitle } from "@/lib/products/productNames";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { StockQuantityEntry } from "@/components/stock/StockQuantityEntry";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Brand, Product, Warehouse } from "@/types/master";

type StockOutStep =
  | "warehouse"
  | "brand"
  | "product"
  | "dispatch"
  | "destination"
  | "confirm";

type StockOutFormProps = {
  requireWarehouse?: boolean;
  defaultWarehouseId?: string;
  allowedWarehouseIds?: string[];
  defaultDispatchType?: "TRANSFER" | "DIRECT_SELLING";
  /**
   * "sell" = direct selling only, "transfer" = warehouse-to-warehouse only,
   * "both" = let the user choose (original behaviour).
   */
  mode?: "sell" | "transfer" | "both";
  onSuccess?: (message: string) => void;
};

export function StockOutForm({
  requireWarehouse = false,
  defaultWarehouseId = "",
  allowedWarehouseIds,
  defaultDispatchType = "DIRECT_SELLING",
  mode = "both",
  onSuccess,
}: StockOutFormProps) {
  const pickWarehouse = shouldPickWarehouse({ requireWarehouse, allowedWarehouseIds });
  const forcedDispatch: "TRANSFER" | "DIRECT_SELLING" | "" =
    mode === "sell" ? "DIRECT_SELLING" : mode === "transfer" ? "TRANSFER" : "";

  const [step, setStep] = useState<StockOutStep>(() =>
    pickWarehouse ? "warehouse" : "brand"
  );

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(pickWarehouse);
  const [loadingBrands, setLoadingBrands] = useState(!pickWarehouse);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");
  const [dispatchType, setDispatchType] = useState<"TRANSFER" | "DIRECT_SELLING" | "">(
    forcedDispatch
  );
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
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

  const destinationOptions = useMemo(
    () => warehouseOptions.filter((w) => w.id !== resolvedWarehouseId),
    [warehouseOptions, resolvedWarehouseId]
  );

  const selectedWarehouse = warehouseOptions.find((w) => w.id === resolvedWarehouseId);
  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedProduct = products.find((p) => p.id === productId);
  const filteredProducts = products.filter(
    (p) => p.isActive && matchesProductSearch(p, productSearch)
  );
  const selectedDestination = destinationOptions.find(
    (w) => w.id === destinationWarehouseId
  );

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
    if (step === "brand" || step === "product" || step === "dispatch" || step === "destination" || step === "confirm") {
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

  useEffect(() => {
    if (step !== "confirm" || !resolvedWarehouseId || !productId) {
      setCurrentBalance(null);
      setBalanceError("");
      return;
    }
    let cancelled = false;
    setLoadingBalance(true);
    setBalanceError("");
    api.stock
      .balances({ warehouseId: resolvedWarehouseId, productId })
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
  }, [step, resolvedWarehouseId, productId]);

  const enteredBaseQty = useMemo(() => {
    const entered = parseInt(quantity, 10);
    if (!Number.isFinite(entered) || entered <= 0) return 0;
    return quantityEntryToBase(entered, quantityMode, selectedProduct);
  }, [quantity, quantityMode, selectedProduct]);

  const exceedsAvailable =
    currentBalance !== null && enteredBaseQty > 0 && enteredBaseQty > currentBalance;
  const cannotConfirmQuantity =
    step === "confirm" && (loadingBalance || currentBalance === null || Boolean(balanceError));

  function selectWarehouse(id: string) {
    setWarehouseId(id);
    setBrandId("");
    setProductId("");
    setDispatchType(forcedDispatch);
    setDestinationWarehouseId("");
    setStep("brand");
  }

  function selectBrand(id: string) {
    setBrandId(id);
    setProductId("");
    setProductSearch("");
    setDispatchType(forcedDispatch);
    setDestinationWarehouseId("");
    setStep("product");
  }

  function selectProduct(id: string) {
    setProductId(id);
    setQuantity("");
    setQuantityMode("stockUnit");
    setDestinationWarehouseId("");
    if (mode === "sell") {
      setDispatchType("DIRECT_SELLING");
      setStep("confirm");
    } else if (mode === "transfer") {
      setDispatchType("TRANSFER");
      setStep("destination");
    } else {
      setDispatchType("");
      setStep("dispatch");
    }
  }

  function selectDispatch(type: "TRANSFER" | "DIRECT_SELLING") {
    setDispatchType(type);
    if (type === "TRANSFER") {
      setDestinationWarehouseId("");
      setStep("destination");
    } else {
      setStep("confirm");
    }
  }

  function selectDestination(id: string) {
    setDestinationWarehouseId(id);
    setStep("confirm");
  }

  function goBack() {
    setError("");
    if (step === "confirm") {
      if (dispatchType === "TRANSFER") {
        setDestinationWarehouseId("");
        setStep("destination");
      } else if (mode === "both") {
        setDispatchType("");
        setStep("dispatch");
      } else {
        setProductId("");
        setStep("product");
      }
    } else if (step === "destination") {
      setDestinationWarehouseId("");
      if (mode === "both") {
        setDispatchType("");
        setStep("dispatch");
      } else {
        setProductId("");
        setStep("product");
      }
    } else if (step === "dispatch") {
      setProductId("");
      setDispatchType("");
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

  function resetFlow() {
    setBrandId("");
    setProductId("");
    setQuantity("");
    setQuantityMode("stockUnit");
    setDispatchType(forcedDispatch);
    setDestinationWarehouseId("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (cannotConfirmQuantity) {
      setError(balanceError || "Wait until the current stock level is loaded");
      return;
    }
    setSubmitting(true);
    const type = dispatchType || defaultDispatchType;
    try {
      const enteredQty = parseInt(quantity, 10);
      const baseQty = quantityEntryToBase(enteredQty, quantityMode, selectedProduct);
      const result = await api.stock.stockOut({
        ...(resolvedWarehouseId ? { warehouseId: resolvedWarehouseId } : {}),
        brandId,
        productId,
        quantity: baseQty,
        dispatchType: type,
        destinationWarehouseId:
          type === "TRANSFER" ? destinationWarehouseId : undefined,
        clientName: type === "DIRECT_SELLING" ? clientName : undefined,
        invoiceNumber:
          type === "DIRECT_SELLING" && invoiceNumber.trim()
            ? invoiceNumber.trim()
            : undefined,
        notes: notes || undefined,
      });
      const formattedBalance = formatBaseQuantityWithStockUnit(
        result.balance,
        selectedProduct
      );
      const msg =
        type === "TRANSFER"
          ? `Transfer sent. Remaining balance: ${formattedBalance}`
          : `Sale recorded${
              result.movement.invoiceNumber
                ? ` · Invoice ${result.movement.invoiceNumber}`
                : ""
            }. Remaining balance: ${formattedBalance}`;
      setSuccess(msg);
      onSuccess?.(msg);
      resetFlow();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record stock out");
    } finally {
      setSubmitting(false);
    }
  }

  const dispatchLabel =
    dispatchType === "TRANSFER"
      ? "Transfer"
      : dispatchType === "DIRECT_SELLING"
        ? "Sale"
        : undefined;

  const flowSteps = [
    ...(pickWarehouse || selectedWarehouse
      ? [{ label: "From", value: selectedWarehouse?.name }]
      : []),
    { label: "Brand", value: selectedBrand?.name },
    { label: "Product", value: selectedProduct?.name },
    ...(mode === "both" && dispatchLabel ? [{ label: "Type", value: dispatchLabel }] : []),
    ...(selectedDestination
      ? [{ label: "To", value: selectedDestination.name }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <StockFlowBar steps={flowSteps} />
      <Alert message={error} />
      <Alert message={success} type="success" />

      {step === "warehouse" && (
        <SelectionGrid
          title="Select warehouse"
          subtitle="Which warehouse are you taking stock from?"
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
              ? `Removing stock from ${selectedWarehouse.name}`
              : "Choose a brand"
          }
          items={brands
            .filter((b) => b.isActive)
            .map((b) => ({ id: b.id, title: b.name }))}
          onSelect={selectBrand}
          onBack={pickWarehouse ? goBack : undefined}
          loading={loadingBrands}
          emptyMessage="No brands found"
        />
      )}

      {step === "product" && (
        <div className="space-y-4">
          <input
            type="search"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search primary or secondary name…"
            className="form-input w-full"
          />
          <SelectionGrid
            title="Select product"
            subtitle={
              selectedBrand
                ? `Brand: ${selectedBrand.name} — same stock for primary or secondary name`
                : undefined
            }
            items={filteredProducts.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: productPickerSubtitle(p),
            }))}
            onSelect={selectProduct}
            onBack={goBack}
            loading={loadingProducts}
            emptyMessage={
              productSearch.trim()
                ? "No products match your search"
                : "No products for this brand"
            }
          />
        </div>
      )}

      {step === "dispatch" && (
        <SelectionGrid
          title="What are you doing?"
          subtitle={selectedProduct ? `Product: ${selectedProduct.name}` : undefined}
          items={[
            {
              id: "DIRECT_SELLING",
              title: "Sell to client",
              subtitle: "Direct sale",
            },
            {
              id: "TRANSFER",
              title: "Send to warehouse",
              subtitle: "Transfer stock",
            },
          ]}
          onSelect={(id) => selectDispatch(id as "TRANSFER" | "DIRECT_SELLING")}
          onBack={goBack}
        />
      )}

      {step === "destination" && (
        <SelectionGrid
          title="Send to which warehouse?"
          subtitle={`From ${selectedWarehouse?.name ?? "warehouse"}`}
          items={destinationOptions.map((w) => ({
            id: w.id,
            title: w.name,
            subtitle: w.code,
          }))}
          onSelect={selectDestination}
          onBack={goBack}
          loading={loadingWarehouses}
          emptyMessage="No other warehouses available"
        />
      )}

      {step === "confirm" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <button
            type="button"
            onClick={goBack}
            className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-stone-200 bg-white px-5 text-base font-bold text-stone-600 transition hover:border-orange-200 hover:bg-orange-50"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path
                fillRule="evenodd"
                d="M11.78 4.22a.75.75 0 010 1.06L7.56 9.5h8.19a.75.75 0 010 1.5H7.56l4.22 4.22a.75.75 0 11-1.06 1.06l-5.5-5.5a.75.75 0 010-1.06l5.5-5.5a.75.75 0 011.06 0z"
                clipRule="evenodd"
              />
            </svg>
            Back
          </button>

          <div className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-bold text-stone-900">
              {dispatchType === "TRANSFER" ? "Confirm transfer" : "Confirm sale"}
            </h2>
            <p className="mt-1 text-base text-stone-500">
              {selectedProduct?.name}
              {selectedProduct?.secondaryName?.trim()
                ? ` · ${selectedProduct.secondaryName}`
                : ""}
              {selectedBrand ? ` · ${selectedBrand.name}` : ""}
              {dispatchType === "TRANSFER" && selectedDestination
                ? ` · To ${selectedDestination.name}`
                : selectedWarehouse
                  ? ` · From ${selectedWarehouse.name}`
                  : ""}
            </p>

            <div className="mt-5 space-y-4">
              {resolvedWarehouseId && selectedProduct ? (
                <div className="rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-sm font-semibold text-stone-600">
                    Available at {selectedWarehouse?.name ?? "warehouse"}
                  </p>
                  <div className="mt-1 min-h-8">
                    {loadingBalance ? (
                      <LoadingSpinner />
                    ) : currentBalance !== null ? (
                      <StockQuantityDisplay
                        quantity={currentBalance}
                        stockUnit={selectedProduct.stockUnit}
                        unitsPerStockUnit={selectedProduct.unitsPerStockUnit}
                        baseUnit={selectedProduct.baseUnit}
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

              <StockQuantityEntry
                product={selectedProduct}
                quantity={quantity}
                onQuantityChange={setQuantity}
                mode={quantityMode}
                onModeChange={setQuantityMode}
              />

              {exceedsAvailable ? (
                <p className="text-sm font-semibold text-red-600">
                  Not enough stock. Available:{" "}
                  {formatBaseQuantityWithStockUnit(currentBalance ?? 0, selectedProduct)}.
                </p>
              ) : null}

              {dispatchType === "DIRECT_SELLING" && (
                <div className="grid gap-4 sm:grid-cols-2">
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
                    <p className="mt-1 text-sm text-stone-500">
                      Leave blank to record the sale without an invoice number. You can add it
                      later on the Invoices page.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-base font-semibold text-stone-700">
                  Notes (optional)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-input mt-2"
                />
              </div>
            </div>

            <Button
              type="submit"
              size="xl"
              loading={submitting}
              disabled={exceedsAvailable || cannotConfirmQuantity}
              className="mt-6 w-full"
            >
              {dispatchType === "TRANSFER" ? "Send transfer" : "Record sale"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
