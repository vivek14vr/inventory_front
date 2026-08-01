import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatStockUnitConversion } from "./productUnits";

describe("formatStockUnitConversion", () => {
  it("shows the package-to-base-unit quantity", () => {
    assert.equal(
      formatStockUnitConversion({
        stockUnit: "carton",
        unitsPerStockUnit: 800,
        baseUnit: "piece",
      }),
      "1 carton = 800 pieces"
    );
  });

  it("omits a conversion when the product has no package unit", () => {
    assert.equal(
      formatStockUnitConversion({
        stockUnit: "piece",
        unitsPerStockUnit: 1,
        baseUnit: "piece",
      }),
      null
    );
  });
});
