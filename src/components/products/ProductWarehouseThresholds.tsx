"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { ProductWarehouseThreshold } from "@/types/master";

type ProductWarehouseThresholdsProps = {
  productId: string;
  productDefault: number | null | undefined;
  baseUnit: string;
  onChange: (values: Record<string, string>) => void;
  values: Record<string, string>;
};

export function ProductWarehouseThresholds({
  productId,
  productDefault,
  baseUnit,
  onChange,
  values,
}: ProductWarehouseThresholdsProps) {
  const [rows, setRows] = useState<ProductWarehouseThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api.products
      .warehouseThresholds(productId)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        const initial: Record<string, string> = {};
        for (const row of data) {
          initial[row.warehouseId] =
            row.warehouseLowStockThreshold != null
              ? String(row.warehouseLowStockThreshold)
              : "";
        }
        onChange(initial);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load warehouse thresholds"
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

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
          Set a different alert level for each warehouse. Leave blank to use the product
          default
          {productDefault != null
            ? ` (${productDefault.toLocaleString()} ${baseUnit})`
            : ""}
          .
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
            {rows.map((row) => (
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
                  <input
                    type="number"
                    min={0}
                    value={values[row.warehouseId] ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...values,
                        [row.warehouseId]: e.target.value,
                      })
                    }
                    placeholder={
                      productDefault != null ? String(productDefault) : "default"
                    }
                    className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function buildWarehouseThresholdPayload(
  values: Record<string, string>
): Array<{ warehouseId: string; lowStockThreshold: number | null }> {
  return Object.entries(values).map(([warehouseId, raw]) => {
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
