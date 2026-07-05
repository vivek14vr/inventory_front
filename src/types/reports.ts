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

export type ReportResult = {
  rows: Record<string, unknown>[];
  groupBy?: string;
  type?: string;
};
