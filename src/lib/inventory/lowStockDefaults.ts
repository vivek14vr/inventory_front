/** Default low-stock alert when not set (10 cartons/boxes). Matches backend. */
export const DEFAULT_LOW_STOCK_STOCK_UNITS = 10;

export function defaultLowStockThresholdBase(unitsPerStockUnit: number): number {
  const per =
    Number.isFinite(unitsPerStockUnit) && unitsPerStockUnit > 0
      ? Math.round(unitsPerStockUnit)
      : 1;
  return DEFAULT_LOW_STOCK_STOCK_UNITS * per;
}
