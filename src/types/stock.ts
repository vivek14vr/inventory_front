export type InventoryBalance = {
  productId: string;
  productName: string;
  secondaryProductName?: string;
  brandId: string;
  brandName: string;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  quantity: number;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  type: "STOCK_IN" | "STOCK_OUT";
  quantity: number;
  dispatchType?: "TRANSFER" | "DIRECT_SELLING";
  clientName?: string;
  invoiceNumber?: string;
  notes?: string;
  invoiceLastWorkedAt?: string;
  product?: { id: string; name: string; secondaryName?: string };
  brand?: { id: string; name: string };
  warehouse?: { id: string; name: string; code: string };
  destinationWarehouse?: { id: string; name: string; code: string };
  transferId?: string;
  createdAt: string;
};

export type PendingTransfer = {
  id: string;
  quantity: number;
  status: string;
  product: {
    id: string;
    name: string;
    secondaryName?: string;
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
  };
  brand: { id: string; name: string };
  sourceWarehouse: { id: string; name: string; code: string };
  destinationWarehouse?: { id: string; name: string; code: string };
  createdAt: string;
};

export type TransferRecord = PendingTransfer & {
  destinationWarehouse: { id: string; name: string; code: string };
  createdBy?: { id: string; name: string };
  receivedBy?: { id: string; name: string };
  returnedBy?: { id: string; name: string };
  receivedAt?: string;
  returnedAt?: string;
  returnNotes?: string;
};

export type TransferActivityDay = {
  date: string;
  items: TransferRecord[];
};

export type TransferActivityReport = {
  total: number;
  byDate: TransferActivityDay[];
  items: TransferRecord[];
};
