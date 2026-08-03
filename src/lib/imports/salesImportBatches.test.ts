import assert from "node:assert/strict";
import test from "node:test";
import type { SalesImportConfirmVoucher } from "../../types/imports";
import { createSalesImportBatches } from "./salesImportBatches";

function voucher(index: number, ignored = false): SalesImportConfirmVoucher {
  return {
    voucherIndex: index,
    headerRowNumber: index * 2,
    clientName: `Client ${index}`,
    invoiceNumber: `INV-${index}`,
    clientAction: "create",
    ignore: ignored,
    lines: [
      {
        rowNumber: index * 2 + 1,
        productName: `Product ${index}`,
        brandName: "Brand",
        quantity: 1,
        warehouseId: "warehouse-id",
        ignore: ignored,
        brandAction: "create",
        action: "create",
      },
    ],
  };
}

test("sales import batches never create an all-ignored request", () => {
  const batches = createSalesImportBatches(
    [voucher(1, true), voucher(2), voucher(3, true), voucher(4), voucher(5, true)],
    1
  );

  assert.equal(batches.length, 2);
  assert.equal(batches.flat().length, 5);
  assert.ok(
    batches.every((batch) =>
      batch.some((item) => item.lines.some((line) => !line.ignore))
    )
  );
});

test("sales import batching preserves active-only behavior", () => {
  const input = [voucher(1), voucher(2), voucher(3)];
  assert.deepEqual(createSalesImportBatches(input, 2), [
    [input[0], input[1]],
    [input[2]],
  ]);
});
