export type Warehouse = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductWarehouseThreshold = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: number;
  warehouseLowStockThreshold: number | null;
  effectiveLowStockThreshold: number | null;
};

export type Brand = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Client = {
  id: string;
  name: string;
  secondaryName?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Product = {
  id: string;
  name: string;
  secondaryName?: string;
  brandId: string;
  brand: { id: string; name: string; isActive: boolean };
  /** Smallest inventory unit, e.g. piece, kg. */
  baseUnit: string;
  /** Pack/stock unit label, e.g. Carton, Box. */
  stockUnit: string;
  /** Base units per one stock unit. */
  unitsPerStockUnit: number;
  /** @deprecated Legacy per-warehouse fallback — prefer total + warehouse overrides. */
  lowStockThreshold?: number;
  /** Overall low-stock alert across all warehouses. */
  totalLowStockThreshold?: number;
  /** Warehouses with a custom low-stock override (not the product default). */
  warehouseLowStockOverrides?: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    lowStockThreshold: number;
  }>;
  /** Total stock across all warehouses (when requested). */
  totalStock?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
