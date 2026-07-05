import type { StockMovement } from "./stock";

export type StockRow = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandId: string;
  brandName: string;
  quantity: number;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  lowStockThreshold?: number;
  warehouseLowStockThreshold?: number;
  productLowStockThreshold?: number;
  updatedAt: string;
};

export type LowStockTotalRow = {
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandId: string;
  brandName: string;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  totalQuantity: number;
  totalLowStockThreshold: number;
};

export type StockSummary = {
  totalUnits: number;
  totalSkus: number;
  byWarehouse: Array<{
    warehouseId: string;
    name: string;
    code: string;
    totalUnits: number;
    skuCount: number;
  }>;
  byBrand: Array<{
    brandId: string;
    name: string;
    totalUnits: number;
    skuCount: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    brandId: string;
    brandName: string;
    totalUnits: number;
  }>;
};

export type StockLocationLastChange = {
  type: "STOCK_IN" | "STOCK_OUT";
  quantity: number;
  createdAt: string;
};

export type StockProductLocation = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: number;
  lowStockThreshold?: number;
  warehouseLowStockThreshold?: number;
  updatedAt: string;
  lastChange?: StockLocationLastChange | null;
};

export type StockProductRow = {
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandId: string;
  brandName: string;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  locations: StockProductLocation[];
  totalQuantity: number;
  totalLowStockThreshold: number;
  productLowStockThreshold?: number;
};

export type StockWarehouseColumn = {
  warehouseId: string;
  name: string;
  code: string;
};

export type StockResponse = {
  items: StockRow[];
  products: StockProductRow[];
  warehouses: StockWarehouseColumn[];
  summary: StockSummary;
};

export type LowStockProductRow = {
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandId: string;
  brandName: string;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  totalQuantity: number;
  totalLowStockThreshold?: number;
  isTotalLow?: boolean;
  warehouseLow?: Record<string, number>;
  warehouseThreshold?: Record<string, number>;
  warehouseThresholdCustom?: Record<string, boolean>;
};

export type LowStockResponse = {
  count: number;
  warehouses: StockWarehouseColumn[];
  items: LowStockProductRow[];
};

export type StockItemLedgerRow = {
  id: string;
  type: "STOCK_IN" | "STOCK_OUT";
  quantity: number;
  direction: "in" | "out";
  change: number;
  balanceAfter: number;
  description: string;
  dispatchType?: string;
  clientName?: string;
  invoiceNumber?: string;
  notes?: string;
  transferId?: string;
  createdBy?: { id: string; name: string };
  createdAt: string;
};

export type StockItemDetailResponse = {
  item: {
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    productId: string;
    productName: string;
    secondaryProductName?: string;
    brandId: string;
    brandName: string;
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
    quantity: number;
    lowStockThreshold?: number;
    warehouseLowStockThreshold?: number;
    productLowStockThreshold?: number;
    updatedAt: string | null;
  };
  summary: {
    totalStockIn: number;
    totalStockOut: number;
    movementCount: number;
  };
  items: StockItemLedgerRow[];
};

export type AdminDashboard = {
  totalInventoryUnits: number;
  totalSkus: number;
  warehouseCount: number;
  pendingTransfers: number;
  lowStockCount: number;
  lowStockItems: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    productId: string;
    productName: string;
    secondaryProductName?: string;
    brandId: string;
    brandName: string;
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
    quantity: number;
    lowStockThreshold?: number;
    warehouseLowStockThreshold?: number;
  }>;
  lowStockTotalCount: number;
  lowStockTotals: Array<{
    productId: string;
    productName: string;
    secondaryProductName?: string;
    brandId: string;
    brandName: string;
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
    totalQuantity: number;
    totalLowStockThreshold: number;
  }>;
  transferActivity: Array<{
    id: string;
    date: string;
    status: string;
    quantity: number;
    product: string;
    brand: string;
    sourceWarehouse: string;
    destinationWarehouse: string;
    initiatedBy?: string;
    receivedBy?: string;
    returnedBy?: string;
    createdAt: string;
    receivedAt?: string;
    returnedAt?: string;
  }>;
  warehouseSummaries: StockSummary["byWarehouse"];
  recentMovements: StockMovement[];
  recentSales: Array<{
    id: string;
    quantity: number;
    clientName?: string;
    invoiceNumber?: string;
    product: string;
    brand: string;
    warehouse: string;
    createdAt: string;
  }>;
};
