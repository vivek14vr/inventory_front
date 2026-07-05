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

export type ProductImportPreviewRow = {
  rowNumber: number;
  brandName: string;
  primaryName: string;
  secondaryName?: string;
  baseUnit: string;
  unitsPerStockUnit: number;
  lowStockThreshold?: number;
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
  action: "merge" | "create";
  mergeTargetProductId?: string;
  brandAction: "merge" | "create";
  mergeTargetBrandId?: string;
};
