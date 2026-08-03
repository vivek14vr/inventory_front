import { api } from "@/lib/api/client";
import { createGeneratedImportReportFile } from "@/lib/imports/exportImportLog";
import type {
  ClientImportResult,
  ImportLogKind,
  ProductImportResult,
  SalesImportResult,
} from "@/types/imports";

export async function persistGeneratedImportReport(
  kind: ImportLogKind,
  result: ProductImportResult | SalesImportResult | ClientImportResult,
  sourceFileName?: string
): Promise<void> {
  const fileName = sourceFileName || result.fileName || `${kind}-import.xlsx`;
  const report = createGeneratedImportReportFile(kind, result, fileName);
  await api.imports.saveGeneratedReport({ kind, fileName, result, report });
}
