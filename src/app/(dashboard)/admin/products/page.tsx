"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import type { PaginationMeta } from "@/types/pagination";
import type { Brand, Product, ProductWarehouseThreshold } from "@/types/master";
import { formatSecondaryName } from "@/lib/products/productNames";
import {
  formatProductUnitSummary,
  formatThresholdPreview,
  thresholdBaseToDisplay,
  thresholdDisplayToBase,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import {
  ProductWarehouseThresholds,
  buildWarehouseThresholdPayload,
} from "@/components/products/ProductWarehouseThresholds";

const emptyForm = {
  name: "",
  secondaryName: "",
  brandId: "",
  baseUnit: "piece",
  stockUnit: "",
  unitsPerStockUnit: "1",
  lowStockThreshold: "",
  editId: null as string | null,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filterBrandId, setFilterBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [warehouseThresholds, setWarehouseThresholds] = useState<Record<string, string>>(
    {}
  );
  const [warehouseThresholdRows, setWarehouseThresholdRows] = useState<
    ProductWarehouseThreshold[]
  >([]);
  const [thresholdMode, setThresholdMode] = useState<QuantityEntryMode>("units");
  const { page, setPage, limit, setLimit, resetPage } = usePagination(20);

  const perPack = parseInt(form.unitsPerStockUnit, 10) || 1;
  const formBaseUnit = form.baseUnit.trim() || "piece";
  const formStockUnit = perPack > 1 ? form.stockUnit.trim() || "unit" : formBaseUnit;
  const productUnits = useMemo(
    () => ({
      baseUnit: formBaseUnit,
      stockUnit: formStockUnit,
      unitsPerStockUnit: perPack,
    }),
    [formBaseUnit, formStockUnit, perPack]
  );
  const defaultThresholdPreview = formatThresholdPreview(
    thresholdBaseToDisplay(
      form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold, 10) : null,
      thresholdMode,
      productUnits
    ),
    thresholdMode,
    productUnits
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productResult, brandList] = await Promise.all([
        api.products.list({
          includeInactive: true,
          brandId: filterBrandId || undefined,
          page,
          limit,
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
        api.brands.list(),
      ]);
      setProducts(productResult.items);
      setPagination(productResult.pagination);
      setBrands(brandList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [filterBrandId, page, limit, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const per = parseInt(form.unitsPerStockUnit, 10) || 1;
      const baseUnit = form.baseUnit.trim() || "piece";
      const stockUnit = per > 1 ? form.stockUnit.trim() || "unit" : baseUnit;
      const payload = {
        name: form.name,
        secondaryName: form.secondaryName.trim() || undefined,
        brandId: form.brandId,
        baseUnit,
        stockUnit,
        unitsPerStockUnit: per,
        lowStockThreshold: form.lowStockThreshold.trim()
          ? parseInt(form.lowStockThreshold, 10)
          : undefined,
      };
      if (form.editId) {
        await api.products.update(form.editId, {
          ...payload,
          secondaryName: form.secondaryName.trim() || null,
          lowStockThreshold: form.lowStockThreshold.trim()
            ? parseInt(form.lowStockThreshold, 10)
            : null,
        });
        const thresholds = buildWarehouseThresholdPayload(
          warehouseThresholds,
          warehouseThresholdRows
        );
        if (thresholds.length > 0) {
          await api.products.updateWarehouseThresholds(form.editId, thresholds);
        }
        setSuccess("Product and warehouse low-stock alerts updated");
      } else {
        const created = await api.products.create(payload);
        const thresholds = buildWarehouseThresholdPayload(warehouseThresholds);
        if (thresholds.length > 0) {
          await api.products.updateWarehouseThresholds(created.id, thresholds);
          setSuccess("Product created with warehouse low-stock alerts");
        } else {
          setSuccess("Product created");
        }
      }
      setForm(emptyForm);
      setWarehouseThresholds({});
      setWarehouseThresholdRows([]);
      setThresholdMode("units");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save product"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item: Product) {
    setError("");
    try {
      await api.products.update(item.id, { isActive: !item.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update product");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Products</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Primary name + brand must be unique (case-insensitive). Set a default low-stock
          level, then optional different values for each warehouse below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <label className="text-sm font-medium text-zinc-700">Search</label>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Product name…"
            className="ml-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
        <ButtonSelect
          label="Filter by brand"
          value={filterBrandId}
          onChange={(v) => {
            setFilterBrandId(v);
            resetPage();
          }}
          size="sm"
          options={[
            { value: "", label: "All brands" },
            ...brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <button
          onClick={() => {
            setShowForm(!showForm);
            setForm(emptyForm);
            setWarehouseThresholds({});
            setWarehouseThresholdRows([]);
            setThresholdMode("units");
          }}
          className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
        >
          {showForm ? "Cancel" : "Add product"}
        </button>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4"
        >
          <h2 className="font-medium text-zinc-900">{form.editId ? "Edit product" : "New product"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Primary name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="e.g. 200ml Glass"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Secondary name (optional)
              </label>
              <input
                value={form.secondaryName}
                onChange={(e) => setForm({ ...form, secondaryName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="e.g. Green cap"
              />
            </div>
            <ButtonSelect
              label="Brand"
              value={form.brandId}
              onChange={(v) => setForm({ ...form, brandId: v })}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              emptyMessage="No brands available"
            />
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Base unit
              </label>
              <input
                required
                value={form.baseUnit}
                onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                className="form-input mt-1"
                placeholder="e.g. piece, kg, liter"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Smallest unit you count in inventory (piece, kg, etc.)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Pack unit name
              </label>
              <input
                value={form.stockUnit}
                onChange={(e) => setForm({ ...form, stockUnit: e.target.value })}
                className="form-input mt-1"
                placeholder="e.g. Carton, Box (only if packs &gt; 1)"
                disabled={parseInt(form.unitsPerStockUnit, 10) <= 1}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Outer pack label when you stock in cartons or boxes
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Base units per pack
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.unitsPerStockUnit}
                onChange={(e) =>
                  setForm({ ...form, unitsPerStockUnit: e.target.value })
                }
                className="form-input mt-1"
                placeholder="1"
              />
              <p className="mt-1 text-xs text-zinc-500">
                e.g. 30 means 1 carton = 30 kg in inventory. Use 1 when you only count
                the base unit.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Default low stock (fallback)
              </label>
              <input
                type="number"
                min={0}
                step={thresholdMode === "stockUnit" && usesStockUnit(productUnits) ? "any" : 1}
                value={thresholdBaseToDisplay(
                  form.lowStockThreshold.trim()
                    ? parseInt(form.lowStockThreshold, 10)
                    : null,
                  thresholdMode,
                  productUnits
                )}
                onChange={(e) => {
                  const nextBase = thresholdDisplayToBase(
                    e.target.value,
                    thresholdMode,
                    productUnits
                  );
                  setForm({
                    ...form,
                    lowStockThreshold: nextBase != null ? String(nextBase) : "",
                  });
                }}
                className="form-input mt-1"
                placeholder="e.g. 50"
              />
              {defaultThresholdPreview ? (
                <p className="mt-1 text-xs font-medium text-zinc-500">{defaultThresholdPreview}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  Used when a warehouse has no custom alert below
                </p>
              )}
            </div>
          </div>
          {usesStockUnit(productUnits) ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-sm text-zinc-600">Low stock alerts in</span>
              <ThresholdUnitToggle
                mode={thresholdMode}
                onModeChange={setThresholdMode}
                product={productUnits}
                size="sm"
              />
            </div>
          ) : null}
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <ProductWarehouseThresholds
              productId={form.editId}
              productDefault={
                form.lowStockThreshold.trim()
                  ? parseInt(form.lowStockThreshold, 10)
                  : null
              }
              baseUnit={formBaseUnit}
              stockUnit={formStockUnit}
              unitsPerStockUnit={perPack}
              thresholdMode={thresholdMode}
              values={warehouseThresholds}
              onChange={setWarehouseThresholds}
              onRowsLoaded={setWarehouseThresholdRows}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || brands.length === 0}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
          {brands.length === 0 && (
            <p className="text-sm text-amber-700">Create at least one brand first.</p>
          )}
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Primary name</th>
              <th className="px-4 py-3">Secondary name</th>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Default low stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No products
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{formatSecondaryName(p.secondaryName)}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.brand.name}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatProductUnitSummary(p)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {p.lowStockThreshold != null ? `≤ ${p.lowStockThreshold}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={p.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => {
                        setForm({
                          name: p.name,
                          secondaryName: p.secondaryName ?? "",
                          brandId: p.brandId,
                          baseUnit: p.baseUnit ?? "piece",
                          stockUnit: p.unitsPerStockUnit > 1 ? p.stockUnit : "",
                          unitsPerStockUnit: String(p.unitsPerStockUnit),
                          lowStockThreshold:
                            p.lowStockThreshold != null ? String(p.lowStockThreshold) : "",
                          editId: p.id,
                        });
                        setWarehouseThresholds({});
                        setWarehouseThresholdRows([]);
                        setThresholdMode("units");
                        setShowForm(true);
                      }}
                      className="text-xs text-zinc-600 hover:text-zinc-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="text-xs text-zinc-600 hover:text-zinc-900"
                    >
                      {p.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </div>
  );
}
