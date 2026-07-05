"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import {
  formatBaseUnits,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";
import type { Brand, Product, Warehouse } from "@/types/master";
import type { ReportFilters, ReportResult, ReportType } from "@/types/reports";

const META_COLUMNS = new Set(["stockUnit", "unitsPerStockUnit", "baseUnit"]);
const QUANTITY_COLUMNS = new Set(["quantity", "totalUnits", "totalQuantity"]);

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "stock", label: "Current stock" },
  { value: "stock-in", label: "Stock In" },
  { value: "stock-out", label: "Stock Out" },
  { value: "transfers", label: "Inter-warehouse transfers" },
  { value: "sales-client", label: "Sales by client" },
  { value: "sales-invoice", label: "Sales by invoice" },
  { value: "sales-brand", label: "Sales by brand" },
];

const COLUMN_MAP: Record<ReportType, string[]> = {
  stock: ["warehouse", "warehouseCode", "product", "brand", "quantity"],
  "stock-in": ["date", "warehouse", "product", "brand", "quantity", "notes"],
  "stock-out": [
    "date",
    "warehouse",
    "product",
    "brand",
    "quantity",
    "dispatchType",
    "destination",
    "clientName",
    "invoiceNumber",
  ],
  transfers: ["date", "status", "product", "brand", "quantity", "from", "to"],
  "sales-client": ["clientName", "totalQuantity", "invoiceCount"],
  "sales-invoice": [
    "date",
    "invoiceNumber",
    "clientName",
    "warehouse",
    "product",
    "brand",
    "quantity",
  ],
  "sales-brand": ["brand", "totalQuantity", "saleCount"],
};

const REPORT_TYPES_WITH_DEFAULT_DATES: ReportType[] = [
  "stock-in",
  "stock-out",
  "transfers",
];

const SALES_REPORT_TYPES: ReportType[] = [
  "sales-client",
  "sales-invoice",
  "sales-brand",
];

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLast30DaysRange(): Pick<ReportFilters, "dateFrom" | "dateTo"> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: toDateInputValue(from),
    dateTo: toDateInputValue(to),
  };
}

function dateInputToIso(dateYmd: string, endOfDay = false): string {
  if (endOfDay) {
    return new Date(`${dateYmd}T23:59:59.999`).toISOString();
  }
  return new Date(`${dateYmd}T00:00:00`).toISOString();
}

function filtersForApi(filters: ReportFilters): ReportFilters {
  const next = { ...filters };
  if (next.dateFrom?.length === 10) {
    next.dateFrom = dateInputToIso(next.dateFrom, false);
  } else {
    delete next.dateFrom;
  }
  if (next.dateTo?.length === 10) {
    next.dateTo = dateInputToIso(next.dateTo, true);
  } else {
    delete next.dateTo;
  }
  return next;
}

function handleReportTypeChange(
  next: ReportType,
  setReportType: (type: ReportType) => void,
  setFilters: Dispatch<SetStateAction<ReportFilters>>
) {
  setReportType(next);
  setFilters((prev) => {
    const updated = { ...prev };
    if (SALES_REPORT_TYPES.includes(next) || next === "stock") {
      delete updated.dateFrom;
      delete updated.dateTo;
    } else if (REPORT_TYPES_WITH_DEFAULT_DATES.includes(next)) {
      Object.assign(updated, getLast30DaysRange());
    }
    return updated;
  });
}

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("stock");
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    groupBy: "detail",
  }));
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [quantityMode, setQuantityMode] = useState<QuantityEntryMode>("stockUnit");

  useEffect(() => {
    Promise.all([api.warehouses.list(true), api.brands.list()]).then(([w, b]) => {
      setWarehouses(w);
      setBrands(b);
    });
  }, []);

  useEffect(() => {
    if (filters.brandId) {
      api.products.listAll({ brandId: filters.brandId }).then(setProducts);
    } else {
      setProducts([]);
    }
  }, [filters.brandId]);

  const runReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await api.reports.fetch(reportType, filtersForApi(filters)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate report");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runReport();
    }, 300);
    return () => clearTimeout(timer);
  }, [reportType, filters, runReport]);

  async function downloadCsv() {
    setExporting(true);
    setError("");
    try {
      await api.reports.downloadCsv(reportType, filtersForApi(filters));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const columns = getColumns(reportType, result);
  const numericCols = numericColumns(columns, result);
  const showQuantityToggle = reportHasStockUnitRows(result, columns);
  const quantityToggleProduct = findToggleProduct(result, columns);

  return (
    <div className="space-y-6 text-zinc-900">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Reports</h1>
        <p className="mt-1 text-sm text-zinc-600">
          The table updates automatically when you change filters. Stock In, Stock Out,
          and Transfers default to the last 30 days. Sales reports show all invoices
          until you set a date range.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <ButtonSelect
          label="Report type"
          value={reportType}
          onChange={(v) => handleReportTypeChange(v as ReportType, setReportType, setFilters)}
          options={REPORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Warehouse"
            value={filters.warehouseId ?? ""}
            onChange={(v) => setFilters({ ...filters, warehouseId: v || undefined })}
            options={[
              { value: "", label: "All" },
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
          <FilterSelect
            label="Brand"
            value={filters.brandId ?? ""}
            onChange={(v) =>
              setFilters({
                ...filters,
                brandId: v || undefined,
                productId: undefined,
              })
            }
            options={[
              { value: "", label: "All" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          {(reportType === "stock" ||
            reportType === "stock-in" ||
            reportType === "stock-out") && (
            <FilterSelect
              label="Product"
              value={filters.productId ?? ""}
              onChange={(v) => setFilters({ ...filters, productId: v || undefined })}
              options={[
                { value: "", label: "All" },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          )}
          {reportType === "stock" && (
            <FilterSelect
              label="Group by"
              value={filters.groupBy ?? "detail"}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  groupBy: v as ReportFilters["groupBy"],
                })
              }
              options={[
                { value: "detail", label: "Detail" },
                { value: "warehouse", label: "Warehouse" },
                { value: "brand", label: "Brand" },
                { value: "product", label: "Product" },
              ]}
            />
          )}
          {(reportType.startsWith("sales") || reportType === "stock-out") && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Client</label>
              <input
                value={filters.clientName ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, clientName: e.target.value || undefined })
                }
                className="mt-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                placeholder="Filter client"
              />
            </div>
          )}
          {(reportType.startsWith("sales") || reportType === "stock-out") && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Invoice</label>
              <input
                value={filters.invoiceNumber ?? ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    invoiceNumber: e.target.value || undefined,
                  })
                }
                className="mt-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                placeholder="Filter invoice"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-500">From date</label>
            <input
              type="date"
              value={filters.dateFrom?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  dateFrom: e.target.value || undefined,
                })
              }
              className="form-date mt-1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">To date</label>
            <input
              type="date"
              value={filters.dateTo?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  dateTo: e.target.value || undefined,
                })
              }
              className="form-date mt-1"
            />
          </div>
          {REPORT_TYPES_WITH_DEFAULT_DATES.includes(reportType) &&
          filters.dateFrom &&
          filters.dateTo ? (
            <p className="w-full text-xs text-zinc-500">
              Showing data from {filters.dateFrom.slice(0, 10)} to{" "}
              {filters.dateTo.slice(0, 10)}
            </p>
          ) : null}
          {SALES_REPORT_TYPES.includes(reportType) &&
          !filters.dateFrom &&
          !filters.dateTo ? (
            <p className="w-full text-xs text-zinc-500">
              Showing all sales. Set From/To dates to narrow the range.
            </p>
          ) : null}
          {SALES_REPORT_TYPES.includes(reportType) &&
          filters.dateFrom &&
          filters.dateTo ? (
            <p className="w-full text-xs text-zinc-500">
              Showing sales from {filters.dateFrom.slice(0, 10)} to{" "}
              {filters.dateTo.slice(0, 10)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={downloadCsv}
            disabled={exporting || loading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Download CSV"}
          </button>
        </div>
      </div>

      <Alert message={error} />

      {(result || loading) && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="flex items-center gap-2 border-b border-stone-200 bg-stone-50/60 px-5 py-3.5 text-sm font-semibold text-stone-700">
            {loading ? (
              "Updating report…"
            ) : (
              <>
                <span className="rounded-lg bg-orange-100 px-2.5 py-1 text-sm font-bold text-orange-800">
                  {result?.rows.length ?? 0}
                </span>
                <span>row{result?.rows.length === 1 ? "" : "s"}</span>
                {result?.groupBy && (
                  <span className="text-stone-400">· grouped by {result.groupBy}</span>
                )}
              </>
            )}
          </p>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-orange-50 text-xs font-bold uppercase tracking-wide text-orange-800 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className={`whitespace-nowrap px-5 py-3.5 ${
                        numericCols.has(col) ? "text-right" : "text-left"
                      }`}
                    >
                      {QUANTITY_COLUMNS.has(col) && showQuantityToggle ? (
                        <div className="flex flex-col items-end gap-2">
                          <span>{formatHeader(col)}</span>
                          <ThresholdUnitToggle
                            mode={quantityMode}
                            onModeChange={setQuantityMode}
                            product={quantityToggleProduct}
                            size="sm"
                          />
                        </div>
                      ) : (
                        formatHeader(col)
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : undefined}>
                {!result || result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-5 py-10 text-center text-base font-medium text-stone-400"
                    >
                      No data for selected filters
                    </td>
                  </tr>
                ) : (
                  result!.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-stone-100 transition-colors odd:bg-white even:bg-stone-50/50 hover:bg-orange-50/60"
                    >
                      {columns.map((col, colIndex) => {
                        const unitsPer = Number(row.unitsPerStockUnit);
                        const rowProduct = {
                          stockUnit:
                            typeof row.stockUnit === "string" ? row.stockUnit : undefined,
                          unitsPerStockUnit: Number.isFinite(unitsPer) ? unitsPer : undefined,
                          baseUnit:
                            typeof row.baseUnit === "string" ? row.baseUnit : undefined,
                        };
                        const showStockUnits =
                          QUANTITY_COLUMNS.has(col) &&
                          typeof row[col] === "number" &&
                          usesStockUnit(rowProduct);
                        return (
                          <td
                            key={col}
                            className={`px-5 py-3 ${
                              numericCols.has(col)
                                ? "text-right font-bold tabular-nums text-stone-900"
                                : colIndex === 0
                                  ? "font-semibold text-stone-900"
                                  : "text-stone-600"
                            }`}
                          >
                            {showStockUnits ? (
                              quantityMode === "units" ? (
                                <span className="whitespace-nowrap">
                                  {formatBaseUnits(row[col] as number, rowProduct)}
                                </span>
                              ) : (
                                <StockQuantityDisplay
                                  quantity={row[col] as number}
                                  stockUnit={rowProduct.stockUnit}
                                  unitsPerStockUnit={rowProduct.unitsPerStockUnit}
                                  baseUnit={rowProduct.baseUnit}
                                  size="sm"
                                  align="right"
                                />
                              )
                            ) : (
                              formatCell(row[col])
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function numericColumns(
  columns: string[],
  result: ReportResult | null
): Set<string> {
  const numeric = new Set<string>();
  if (!result?.rows.length) return numeric;
  for (const col of columns) {
    const sample = result.rows.find(
      (row) => row[col] !== null && row[col] !== undefined && row[col] !== ""
    )?.[col];
    if (typeof sample === "number") numeric.add(col);
  }
  return numeric;
}

function getColumns(type: ReportType, result: ReportResult | null): string[] {
  if (!result?.rows.length) return COLUMN_MAP[type];
  const keys = Object.keys(result.rows[0]).filter((k) => !META_COLUMNS.has(k));
  const preferred = COLUMN_MAP[type].filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferred.includes(k));
  return [...preferred, ...rest];
}

function formatHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (value instanceof Date || (typeof value === "string" && value.includes("T"))) {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }
  return String(value);
}

function rowProductUnits(row: Record<string, unknown>) {
  const unitsPer = Number(row.unitsPerStockUnit);
  return {
    stockUnit: typeof row.stockUnit === "string" ? row.stockUnit : undefined,
    unitsPerStockUnit: Number.isFinite(unitsPer) ? unitsPer : undefined,
    baseUnit: typeof row.baseUnit === "string" ? row.baseUnit : undefined,
  };
}

function reportHasStockUnitRows(
  result: ReportResult | null,
  columns: string[]
): boolean {
  if (!result?.rows.length) return false;
  return result.rows.some((row) =>
    columns.some(
      (col) =>
        QUANTITY_COLUMNS.has(col) &&
        typeof row[col] === "number" &&
        usesStockUnit(rowProductUnits(row))
    )
  );
}

function findToggleProduct(
  result: ReportResult | null,
  columns: string[]
): ReturnType<typeof rowProductUnits> | null {
  if (!result?.rows.length) return null;
  for (const row of result.rows) {
    for (const col of columns) {
      if (
        QUANTITY_COLUMNS.has(col) &&
        typeof row[col] === "number" &&
        usesStockUnit(rowProductUnits(row))
      ) {
        return rowProductUnits(row);
      }
    }
  }
  return null;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <ButtonSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
    />
  );
}
