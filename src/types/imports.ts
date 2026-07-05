export type TallyImportRow = {
  productName: string;
  brandName: string;
  quantity: number;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  message?: string;
};

export type TallyImport = {
  id: string;
  fileName: string;
  warehouse: { id: string; name: string; code: string };
  importedBy: { id: string; name: string };
  totalRows: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  rows: TallyImportRow[];
  createdAt: string;
};

export type WarehouseLowStockImportEntry = {
  warehouseId?: string;
  warehouseName: string;
  lowStockThreshold: number;
};

export type ProductImportPreviewRow = {
  rowNumber: number;
  brandName: string;
  primaryName: string;
  secondaryName?: string;
  baseUnit: string;
  unitsPerStockUnit: number;
  lowStockThreshold?: number;
  totalLowStockThreshold?: number;
  warehouseLowStockThresholds?: WarehouseLowStockImportEntry[];
  stockUnit: string;
  category: "matched" | "new";
  brandCategory: "matched" | "new";
  brandExists: boolean;
  brandId?: string;
  errors: string[];
  matchedBrand?: {
    id: string;
    name: string;
  };
  reactivatesBrand?: {
    id: string;
    name: string;
  };
  matchedProduct?: {
    id: string;
    name: string;
    secondaryName?: string;
    baseUnit: string;
    stockUnit: string;
    unitsPerStockUnit: number;
    lowStockThreshold?: number;
  };
  reactivatesProduct?: {
    id: string;
    name: string;
  };
};

export type ProductImportExistingProduct = {
  id: string;
  name: string;
  secondaryName?: string;
  brandId: string;
  brandName: string;
  baseUnit: string;
  stockUnit: string;
  unitsPerStockUnit: number;
};

export type ProductImportExistingBrand = {
  id: string;
  name: string;
};

export type ProductImportPreview = {
  totalRows: number;
  matchedCount: number;
  newCount: number;
  errorCount: number;
  rows: ProductImportPreviewRow[];
  existingBrands: ProductImportExistingBrand[];
  existingProducts: ProductImportExistingProduct[];
};

export type ProductImportResultRow = {
  rowNumber: number;
  brandName: string;
  primaryName: string;
  secondaryName?: string;
  baseUnit?: string;
  unitsPerStockUnit?: number;
  lowStockThreshold?: number;
  totalLowStockThreshold?: number;
  warehouseLowStockThresholds?: WarehouseLowStockImportEntry[];
  brandAction?: "merge" | "create";
  mergeTargetBrandId?: string;
  status: "SUCCESS" | "FAILED";
  action: "merge" | "create";
  mergeTargetProductId?: string;
  message?: string;
  productId?: string;
};

export type ProductImportResult = {
  fileName?: string;
  warehouse?: { id: string; name: string; code: string };
  warehouses?: Array<{ id: string; name: string; code: string }>;
  totalRows: number;
  successCount: number;
  failedCount: number;
  rows: ProductImportResultRow[];
};

export type ProductImportRowDecision = {
  rowNumber: number;
  brandName: string;
  primaryName: string;
  secondaryName?: string;
  baseUnit: string;
  unitsPerStockUnit: number;
  lowStockThreshold?: number;
  totalLowStockThreshold?: number;
  warehouseLowStockThresholds?: WarehouseLowStockImportEntry[];
  action: "merge" | "create";
  mergeTargetProductId?: string;
  brandAction: "merge" | "create";
  mergeTargetBrandId?: string;
};

export type SalesImportExistingProduct = {
  id: string;
  name: string;
  secondaryName?: string;
  brandId: string;
  brandName: string;
  baseUnit: string;
  stockUnit: string;
  unitsPerStockUnit: number;
};

export type SalesImportLinePreview = {
  rowNumber: number;
  productName: string;
  quantity: number;
  category: "matched" | "unmatched";
  errors: string[];
  matchedProduct?: {
    id: string;
    name: string;
    secondaryName?: string;
    brandId: string;
    brandName: string;
  };
};

export type SalesImportVoucherPreview = {
  voucherIndex: number;
  headerRowNumber: number;
  sellDate: string;
  clientName: string;
  invoiceNumber: string;
  errors: string[];
  lines: SalesImportLinePreview[];
};

export type SalesImportExistingBrand = {
  id: string;
  name: string;
};

export type SalesImportPreview = {
  totalVouchers: number;
  totalLines: number;
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  vouchers: SalesImportVoucherPreview[];
  existingBrands: SalesImportExistingBrand[];
  existingProducts: SalesImportExistingProduct[];
};

export type SalesImportConfirmLine = {
  rowNumber: number;
  productName: string;
  quantity: number;
  action: "merge" | "create";
  mergeTargetProductId?: string;
  createBrandId?: string;
};

export type SalesImportConfirmVoucher = {
  voucherIndex: number;
  headerRowNumber: number;
  sellDate?: string;
  clientName: string;
  invoiceNumber: string;
  lines: SalesImportConfirmLine[];
};

export type SalesImportResultLine = {
  rowNumber: number;
  voucherIndex: number;
  headerRowNumber: number;
  clientName: string;
  invoiceNumber: string;
  sellDate: string;
  productName: string;
  quantity: number;
  mergeTargetProductId?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  message?: string;
};

export type SalesImportResultVoucher = {
  voucherIndex: number;
  headerRowNumber: number;
  clientName: string;
  invoiceNumber: string;
  sellDate: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  message?: string;
  movementCount?: number;
};

export type SalesImportResult = {
  fileName?: string;
  warehouse: { id: string; name: string; code: string };
  totalVouchers: number;
  totalLines: number;
  successCount: number;
  failedCount: number;
  createdProductCount?: number;
  vouchers: SalesImportResultVoucher[];
  rows: SalesImportResultLine[];
};
