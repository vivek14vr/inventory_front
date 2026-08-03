import type { SalesImportConfirmVoucher } from "../../types/imports";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size < 1) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function createSalesImportBatches(
  vouchers: SalesImportConfirmVoucher[],
  size: number
): SalesImportConfirmVoucher[][] {
  const activeVouchers = vouchers.filter((voucher) =>
    voucher.lines.some((line) => !line.ignore)
  );
  const ignoredVouchers = vouchers.filter((voucher) =>
    voucher.lines.every((line) => line.ignore)
  );
  const batches = chunkArray(activeVouchers, size);

  // The backend intentionally rejects an all-ignored request. Attach ignored
  // invoices to active batches so they are reported as SKIPPED without changing
  // the established stock-import validation or transaction flow.
  ignoredVouchers.forEach((voucher, index) => {
    batches[index % batches.length]?.push(voucher);
  });
  return batches;
}
