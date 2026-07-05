"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import {
  formatThresholdPreview,
  thresholdBaseToDisplay,
  thresholdDisplayToBase,
  type ProductUnitFields,
  type QuantityEntryMode,
} from "@/lib/products/productUnits";
import type { ProductWarehouseThreshold } from "@/types/master";
import {
  DEFAULT_LOW_STOCK_STOCK_UNITS,
  defaultLowStockThresholdBase,
} from "@/lib/inventory/lowStockDefaults";

type ProductWarehouseThresholdsProps = {
  productId?: string | null;
  baseUnit: string;
  stockUnit: string;
  unitsPerStockUnit: number;
  thresholdMode: QuantityEntryMode;
  onChange: (values: Record<string, string>) => void;
  onRowsLoaded?: (rows: ProductWarehouseThreshold[]) => void;
  values: Record<string, string>;
};

function rowsToInitialValues(
  rows: ProductWarehouseThreshold[]
): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const row of rows) {
    initial[row.warehouseId] =
      row.warehouseLowStockThreshold != null
        ? String(row.warehouseLowStockThreshold)
        : "";
  }
  return initial;
}

export function ProductWarehouseThresholds({
  productId,
  baseUnit,
  stockUnit,
  unitsPerStockUnit,
  thresholdMode,
  onChange,
  onRowsLoaded,
  values,
}: ProductWarehouseThresholdsProps) {
  const [rows, setRows] = useState<ProductWarehouseThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const productUnits = useMemo<Partial<ProductUnitFields>>(
    () => ({
      baseUnit: baseUnit.trim() || "piece",
      stockUnit: stockUnit.trim() || "unit",
      unitsPerStockUnit: unitsPerStockUnit > 1 ? unitsPerStockUnit : 1,
    }),
    [baseUnit, stockUnit, unitsPerStockUnit]
  );

  const canToggle = unitsPerStockUnit > 1;
  const defaultBase = defaultLowStockThresholdBase(unitsPerStockUnit);
  const defaultPlaceholder =
    thresholdBaseToDisplay(defaultBase, thresholdMode, productUnits) ||
    String(DEFAULT_LOW_STOCK_STOCK_UNITS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const load = productId
      ? api.products.warehouseThresholds(productId)
      : api.warehouses.list().then((warehouses) =>
          warehouses
            .filter((warehouse) => warehouse.isActive)
            .map((warehouse) => ({
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
              warehouseCode: warehouse.code,
              quantity: 0,
              warehouseLowStockThreshold: null,
              effectiveLowStockThreshold: null,
            }))
        );

    void load
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        onRowsLoaded?.(data);
        onChange(rowsToInitialValues(data));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load warehouse thresholds"
        );
        setRows([]);
        onRowsLoaded?.([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, onChange, onRowsLoaded]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading warehouses…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-amber-700">
        No active warehouses. Create warehouses first to set per-location alerts.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Low stock by warehouse</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Independent alert for each warehouse. Leave blank to use the default (
          {DEFAULT_LOW_STOCK_STOCK_UNITS} cartons).
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Alert at or below</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const baseValue = values[row.warehouseId] ?? "";
              const displayValue = thresholdBaseToDisplay(
                baseValue.trim() ? parseInt(baseValue, 10) : null,
                thresholdMode,
                productUnits
              );
              const preview = formatThresholdPreview(displayValue, thresholdMode, productUnits);

              return (
                <tr key={row.warehouseId} className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-zinc-900">{row.warehouseName}</span>
                    <span className="ml-1.5 font-mono text-xs text-zinc-500">
                      ({row.warehouseCode})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {row.quantity.toLocaleString()} {baseUnit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-col items-end gap-1">
                      <input
                        type="number"
                        min={0}
                        step={thresholdMode === "stockUnit" && canToggle ? "any" : 1}
                        value={displayValue}
                        onChange={(e) => {
                          const nextBase = thresholdDisplayToBase(
                            e.target.value,
                            thresholdMode,
                            productUnits
                          );
                          onChange({
                            ...values,
                            [row.warehouseId]:
                              nextBase != null ? String(nextBase) : "",
                          });
                        }}
                        placeholder={defaultPlaceholder}
                        className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm"
                      />
                      {preview ? (
                        <span className="text-[10px] font-medium text-zinc-500">{preview}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function buildWarehouseThresholdPayload(
  values: Record<string, string>,
  previousRows: ProductWarehouseThreshold[] = []
): Array<{ warehouseId: string; lowStockThreshold: number | null }> {
  const previousByWarehouse = new Map(
    previousRows.map((row) => [row.warehouseId, row.warehouseLowStockThreshold])
  );

  return Object.entries(values)
    .filter(([warehouseId, raw]) => {
      if (raw.trim()) return true;
      return previousByWarehouse.get(warehouseId) != null;
    })
    .map(([warehouseId, raw]) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return { warehouseId, lowStockThreshold: null };
      }
      const parsed = parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Each warehouse threshold must be a whole number (0 or greater)");
      }
      return { warehouseId, lowStockThreshold: parsed };
    });
}
