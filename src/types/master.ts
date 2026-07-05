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
  /** Alert when stock falls to this level or below. */
  lowStockThreshold?: number;
  /** Warehouses with a custom low-stock override (not the product default). */
  warehouseLowStockOverrides?: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    lowStockThreshold: number;
  }>;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
