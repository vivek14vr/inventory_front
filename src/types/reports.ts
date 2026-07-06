export type ReportType =
  | "stock"
  | "stock-in"
  | "stock-out"
  | "transfers"
  | "sales-client"
  | "sales-invoice"
  | "sales-brand";

export type ReportFilters = {
  warehouseId?: string;
  brandId?: string;
  productId?: string;
  clientName?: string;
  invoiceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  groupBy?: "detail" | "warehouse" | "brand" | "product";
};

export type SalesByClientInvoiceLine = {
  product: string;
  brand: string;
  warehouse: string;
  quantity: number;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
};

export type SalesByClientInvoice = {
  invoiceNumber: string;
  date: string;
  warehouse: string;
  totalQuantity: number;
  lineCount: number;
  lines: SalesByClientInvoiceLine[];
};

export type SalesByClientRow = {
  clientName: string;
  totalQuantity: number;
  invoiceCount: number;
  invoices?: SalesByClientInvoice[];
};

export type ReportResult = {
  rows: Record<string, unknown>[];
  groupBy?: string;
  type?: string;
};
