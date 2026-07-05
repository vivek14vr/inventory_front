"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";

type UseWarehouseProductBalancesOptions = {
  enabled: boolean;
  brandId?: string;
};

export function useWarehouseProductBalances(
  warehouseId: string | undefined,
  { enabled, brandId }: UseWarehouseProductBalancesOptions
) {
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !warehouseId || !brandId) {
      setBalances({});
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    api.stock
      .productAvailability({ warehouseId, brandId })
      .then((items) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const item of items) {
          map[item.productId] = item.quantity;
        }
        setBalances(map);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setBalances({});
        setError(err instanceof ApiError ? err.message : "Could not load stock levels");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [warehouseId, enabled, brandId]);

  function quantityFor(productId: string): number {
    return balances[productId] ?? 0;
  }

  return { balances, loading, error, quantityFor };
}
