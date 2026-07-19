"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockQuantityDisplay } from "@/components/inventory/StockQuantityDisplay";
import { ThresholdUnitToggle } from "@/components/products/ThresholdUnitToggle";
import { usePermissions } from "@/hooks/usePermissions";
import { Permission } from "@/lib/auth/permissions";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";
import type { Brand, Product, Warehouse } from "@/types/master";
import type {
  ReportFilters,
  ReportResult,
  ReportType,
  SalesByBrandProduct,
  SalesByBrandProductSale,
  SalesByClientInvoice,
} from "@/types/reports";

const META_COLUMNS = new Set(["stockUnit", "unitsPerStockUnit", "baseUnit"]);
const HIDDEN_COLUMNS = new Set([...META_COLUMNS, "invoices", "lines", "products"]);
const QUANTITY_COLUMNS = new Set(["quantity", "totalUnits", "totalQuantity"]);

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "stock", label: "Current stock" },
  { value: "stock-in", label: "Stock In" },
  { value: "stock-out", label: "Stock Out" },
  { value: "returns", label: "Returns" },
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
  returns: [
    "date",
    "warehouse",
    "product",
    "brand",
    "quantity",
    "clientName",
    "invoiceNumber",
    "notes",
  ],
  transfers: ["date", "from", "to", "product", "brand", "status", "quantity", "receivedAt"],
  "sales-client": ["clientName", "totalQuantity", "invoiceCount"],
  "sales-invoice": [
    "date",
    "invoiceNumber",
    "clientName",
    "warehouse",
    "totalQuantity",
    "lineCount",
  ],
  "sales-brand": ["brand", "totalQuantity", "saleCount"],
};

const REPORT_TYPES_WITH_DEFAULT_DATES: ReportType[] = [
  "stock-in",
  "stock-out",
  "returns",
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
  const { isAdmin, warehousesFor } = usePermissions();
  const reportWarehouseIds = warehousesFor(Permission.REPORTS_VIEW);
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
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([api.warehouses.list(isAdmin), api.brands.list()]).then(([w, b]) => {
      setWarehouses(w);
      setBrands(b);
    });
  }, [isAdmin]);

  const warehouseOptions = useMemo(() => {
    if (isAdmin) return warehouses;
    if (reportWarehouseIds.length === 0) return [];
    const allowed = new Set(reportWarehouseIds);
    return warehouses.filter((w) => allowed.has(w.id));
  }, [isAdmin, warehouses, reportWarehouseIds]);

  useEffect(() => {
    if (
      filters.warehouseId &&
      warehouseOptions.length > 0 &&
      !warehouseOptions.some((w) => w.id === filters.warehouseId)
    ) {
      setFilters((prev) => ({ ...prev, warehouseId: undefined }));
    }
  }, [filters.warehouseId, warehouseOptions]);

  useEffect(() => {
    if (filters.brandId) {
      api.products.listAll({ brandId: filters.brandId }).then(setProducts);
    } else {
      setProducts([]);
    }
  }, [filters.brandId]);

  useEffect(() => {
    setExpandedClients(new Set());
    setExpandedInvoices(new Set());
    setExpandedBrands(new Set());
  }, [reportType, filters]);

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
  const isSalesByClient = reportType === "sales-client";
  const isSalesByInvoice = reportType === "sales-invoice";
  const isSalesByBrand = reportType === "sales-brand";
  const expandableReport =
    isSalesByClient || isSalesByInvoice || isSalesByBrand;

  function toggleClientExpanded(clientName: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) {
        next.delete(clientName);
      } else {
        next.add(clientName);
      }
      return next;
    });
  }

  function toggleInvoiceExpanded(invoiceKey: string) {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceKey)) {
        next.delete(invoiceKey);
      } else {
        next.add(invoiceKey);
      }
      return next;
    });
  }

  function toggleBrandExpanded(brandName: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brandName)) {
        next.delete(brandName);
      } else {
        next.add(brandName);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Reports"
        description="The table updates automatically when you change filters. Stock In, Stock Out, and Transfers default to the last 30 days. Sales reports show all invoices until you set a date range."
      />

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
              ...warehouseOptions.map((w) => ({ value: w.id, label: w.name })),
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
            reportType === "stock-out" ||
            reportType === "returns") && (
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
          {(reportType.startsWith("sales") ||
            reportType === "stock-out" ||
            reportType === "returns") && (
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
          {(reportType.startsWith("sales") ||
            reportType === "stock-out" ||
            reportType === "returns") && (
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
                {isSalesByClient && (result?.rows.length ?? 0) > 0 ? (
                  <span className="text-stone-400">· click a client to view invoices</span>
                ) : null}
                {isSalesByInvoice && (result?.rows.length ?? 0) > 0 ? (
                  <span className="text-stone-400">· one row per invoice · click to view products</span>
                ) : null}
                {isSalesByBrand && (result?.rows.length ?? 0) > 0 ? (
                  <span className="text-stone-400">
                    · click a brand to view products · click a product for sale details
                  </span>
                ) : null}
              </>
            )}
          </p>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-orange-50 text-xs font-bold uppercase tracking-wide text-orange-800 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
                <tr>
                  {expandableReport ? (
                    <th className="w-10 px-3 py-3.5" aria-hidden />
                  ) : null}
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
                      colSpan={columns.length + (expandableReport ? 1 : 0)}
                      className="px-5 py-10 text-center text-base font-medium text-stone-400"
                    >
                      No data for selected filters
                    </td>
                  </tr>
                ) : isSalesByClient ? (
                  result.rows.map((row, i) => {
                    const clientName = String(row.clientName ?? "");
                    const invoices = parseClientInvoices(row.invoices);
                    const isExpanded = expandedClients.has(clientName);
                    const canExpand = invoices.length > 0;

                    return (
                      <Fragment key={`${clientName}-${i}`}>
                        <tr
                          className={`border-t border-stone-100 transition-colors odd:bg-white even:bg-stone-50/50 ${
                            canExpand
                              ? "cursor-pointer hover:bg-orange-50/60"
                              : "hover:bg-orange-50/60"
                          } ${isExpanded ? "bg-orange-50/40" : ""}`}
                          onClick={
                            canExpand ? () => toggleClientExpanded(clientName) : undefined
                          }
                          aria-expanded={canExpand ? isExpanded : undefined}
                        >
                          <td className="px-3 py-3 text-center text-stone-400">
                            {canExpand ? (
                              <span
                                className="inline-block text-xs transition-transform"
                                aria-hidden
                              >
                                {isExpanded ? "▼" : "▶"}
                              </span>
                            ) : null}
                          </td>
                          {columns.map((col, colIndex) =>
                            renderReportCell({
                              col,
                              colIndex,
                              row,
                              numericCols,
                              quantityMode,
                            })
                          )}
                        </tr>
                        {isExpanded && invoices.length > 0 ? (
                          <tr className="border-t border-orange-100 bg-orange-50/30">
                            <td colSpan={columns.length + 1} className="px-5 py-4">
                              <SalesByClientInvoiceDetails
                                invoices={invoices}
                                quantityMode={quantityMode}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : isSalesByInvoice ? (
                  result.rows.map((row, i) => {
                    const invoiceKey = salesInvoiceRowKey(row);
                    const invoiceDetails = rowToSalesInvoice(row);
                    const isExpanded = expandedInvoices.has(invoiceKey);
                    const canExpand = (invoiceDetails?.lines.length ?? 0) > 0;

                    return (
                      <Fragment key={`${invoiceKey}-${i}`}>
                        <tr
                          className={`border-t border-stone-100 transition-colors odd:bg-white even:bg-stone-50/50 ${
                            canExpand
                              ? "cursor-pointer hover:bg-orange-50/60"
                              : "hover:bg-orange-50/60"
                          } ${isExpanded ? "bg-orange-50/40" : ""}`}
                          onClick={
                            canExpand ? () => toggleInvoiceExpanded(invoiceKey) : undefined
                          }
                          aria-expanded={canExpand ? isExpanded : undefined}
                        >
                          <td className="px-3 py-3 text-center text-stone-400">
                            {canExpand ? (
                              <span
                                className="inline-block text-xs transition-transform"
                                aria-hidden
                              >
                                {isExpanded ? "▼" : "▶"}
                              </span>
                            ) : null}
                          </td>
                          {columns.map((col, colIndex) =>
                            renderReportCell({
                              col,
                              colIndex,
                              row,
                              numericCols,
                              quantityMode,
                            })
                          )}
                        </tr>
                        {isExpanded && invoiceDetails ? (
                          <tr className="border-t border-orange-100 bg-orange-50/30">
                            <td colSpan={columns.length + 1} className="px-5 py-4">
                              <SalesByClientInvoiceDetails
                                invoices={[invoiceDetails]}
                                quantityMode={quantityMode}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : isSalesByBrand ? (
                  result.rows.map((row, i) => {
                    const brandName = String(row.brand ?? "");
                    const products = parseBrandProducts(row.products);
                    const isExpanded = expandedBrands.has(brandName);
                    const canExpand = products.length > 0;

                    return (
                      <Fragment key={`${brandName}-${i}`}>
                        <tr
                          className={`border-t border-stone-100 transition-colors odd:bg-white even:bg-stone-50/50 ${
                            canExpand
                              ? "cursor-pointer hover:bg-orange-50/60"
                              : "hover:bg-orange-50/60"
                          } ${isExpanded ? "bg-orange-50/40" : ""}`}
                          onClick={
                            canExpand ? () => toggleBrandExpanded(brandName) : undefined
                          }
                          aria-expanded={canExpand ? isExpanded : undefined}
                        >
                          <td className="px-3 py-3 text-center text-stone-400">
                            {canExpand ? (
                              <span
                                className="inline-block text-xs transition-transform"
                                aria-hidden
                              >
                                {isExpanded ? "▼" : "▶"}
                              </span>
                            ) : null}
                          </td>
                          {columns.map((col, colIndex) =>
                            renderReportCell({
                              col,
                              colIndex,
                              row,
                              numericCols,
                              quantityMode,
                            })
                          )}
                        </tr>
                        {isExpanded && products.length > 0 ? (
                          <tr className="border-t border-orange-100 bg-orange-50/30">
                            <td colSpan={columns.length + 1} className="px-5 py-4">
                              <SalesByBrandProductDetails
                                products={products}
                                quantityMode={quantityMode}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  result!.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-stone-100 transition-colors odd:bg-white even:bg-stone-50/50 hover:bg-orange-50/60"
                    >
                      {columns.map((col, colIndex) =>
                        renderReportCell({
                          col,
                          colIndex,
                          row,
                          numericCols,
                          quantityMode,
                        })
                      )}
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
  const keys = Object.keys(result.rows[0]).filter((k) => !HIDDEN_COLUMNS.has(k));
  const preferred = COLUMN_MAP[type].filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferred.includes(k));
  return [...preferred, ...rest];
}

function formatHeader(key: string): string {
  if (key === "lineCount") return "Products";
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

function parseClientInvoices(value: unknown): SalesByClientInvoice[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SalesByClientInvoice =>
      typeof item === "object" &&
      item != null &&
      typeof (item as SalesByClientInvoice).invoiceNumber === "string" &&
      Array.isArray((item as SalesByClientInvoice).lines)
  );
}

function salesInvoiceRowKey(row: Record<string, unknown>): string {
  return [
    String(row.invoiceNumber ?? ""),
    String(row.clientName ?? ""),
    String(row.warehouse ?? ""),
  ].join("\0");
}

function parseInvoiceLines(value: unknown): SalesByClientInvoice["lines"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SalesByClientInvoice["lines"][number] =>
      typeof item === "object" &&
      item != null &&
      typeof (item as { product?: unknown }).product === "string" &&
      typeof (item as { brand?: unknown }).brand === "string" &&
      typeof (item as { quantity?: unknown }).quantity === "number"
  );
}

function rowToSalesInvoice(row: Record<string, unknown>): SalesByClientInvoice | null {
  const lines = parseInvoiceLines(row.lines);
  const invoiceNumber = String(row.invoiceNumber ?? "");
  if (!invoiceNumber && lines.length === 0) return null;

  return {
    invoiceNumber,
    date: String(row.date ?? ""),
    warehouse: String(row.warehouse ?? ""),
    clientName: String(row.clientName ?? ""),
    totalQuantity: Number(row.totalQuantity ?? lines.reduce((sum, line) => sum + line.quantity, 0)),
    lineCount: Number(row.lineCount ?? lines.length),
    lines,
  };
}

function parseBrandProductSales(value: unknown): SalesByBrandProductSale[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item == null) return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.quantity !== "number" || !Number.isFinite(raw.quantity)) {
      return [];
    }
    return [
      {
        date: raw.date != null ? String(raw.date) : "",
        clientName: typeof raw.clientName === "string" ? raw.clientName : "",
        invoiceNumber:
          typeof raw.invoiceNumber === "string" ? raw.invoiceNumber : "",
        warehouse: typeof raw.warehouse === "string" ? raw.warehouse : "",
        quantity: raw.quantity,
      } satisfies SalesByBrandProductSale,
    ];
  });
}

function parseBrandProducts(value: unknown): SalesByBrandProduct[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item == null) return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.product !== "string" || typeof raw.quantity !== "number") {
      return [];
    }
    return [
      {
        product: raw.product,
        quantity: raw.quantity,
        saleCount: typeof raw.saleCount === "number" ? raw.saleCount : 0,
        stockUnit: typeof raw.stockUnit === "string" ? raw.stockUnit : undefined,
        unitsPerStockUnit:
          typeof raw.unitsPerStockUnit === "number"
            ? raw.unitsPerStockUnit
            : undefined,
        baseUnit: typeof raw.baseUnit === "string" ? raw.baseUnit : undefined,
        sales: parseBrandProductSales(raw.sales),
      } satisfies SalesByBrandProduct,
    ];
  });
}

function renderReportCell({
  col,
  colIndex,
  row,
  numericCols,
  quantityMode,
}: {
  col: string;
  colIndex: number;
  row: Record<string, unknown>;
  numericCols: Set<string>;
  quantityMode: QuantityEntryMode;
}) {
  const rowProduct = rowProductUnits(row);
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
}

function SalesByBrandProductDetails({
  products,
  quantityMode,
}: {
  products: SalesByBrandProduct[];
  quantityMode: QuantityEntryMode;
}) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    () => new Set()
  );

  function toggleProduct(productName: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productName)) next.delete(productName);
      else next.add(productName);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 bg-stone-50/80 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
          Products · {products.length}
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-stone-400">
          <tr>
            <th className="w-8 px-3 py-2" aria-hidden />
            <th className="px-4 py-2 text-left">Product</th>
            <th className="px-4 py-2 text-right">Quantity</th>
            <th className="px-4 py-2 text-right">Sales</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => {
            const productKey = `${product.product}-${index}`;
            const sales = product.sales ?? [];
            const canExpand = sales.length > 0;
            const isExpanded = expandedProducts.has(productKey);

            return (
              <Fragment key={productKey}>
                <tr
                  className={`border-t border-stone-100 ${
                    canExpand
                      ? "cursor-pointer hover:bg-orange-50/50"
                      : ""
                  } ${isExpanded ? "bg-orange-50/30" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canExpand) toggleProduct(productKey);
                  }}
                  aria-expanded={canExpand ? isExpanded : undefined}
                >
                  <td className="px-3 py-2.5 text-center text-stone-400">
                    {canExpand ? (
                      <span className="inline-block text-xs" aria-hidden>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-stone-900">
                    {product.product}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-stone-800">
                    <ReportQuantityValue
                      quantity={product.quantity}
                      product={product}
                      quantityMode={quantityMode}
                      align="right"
                      compact
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-stone-900">
                    {product.saleCount.toLocaleString()}
                  </td>
                </tr>
                {isExpanded && canExpand ? (
                  <tr className="border-t border-orange-100 bg-orange-50/20">
                    <td colSpan={4} className="px-4 py-3">
                      <BrandProductSalesTable
                        product={product}
                        sales={sales}
                        quantityMode={quantityMode}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BrandProductSalesTable({
  product,
  sales,
  quantityMode,
}: {
  product: SalesByBrandProduct;
  sales: SalesByBrandProductSale[];
  quantityMode: QuantityEntryMode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Warehouse</th>
            <th className="px-3 py-2 text-right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale, index) => (
            <tr
              key={`${sale.invoiceNumber}-${sale.date}-${index}`}
              className="border-t border-stone-100"
            >
              <td className="px-3 py-2 whitespace-nowrap text-stone-600">
                {formatCell(sale.date)}
              </td>
              <td className="px-3 py-2 font-medium text-stone-900">
                {sale.clientName || "—"}
              </td>
              <td className="px-3 py-2 text-stone-700">
                {sale.invoiceNumber || "—"}
              </td>
              <td className="px-3 py-2 text-stone-600">
                {sale.warehouse || "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <ReportQuantityValue
                  quantity={sale.quantity}
                  product={product}
                  quantityMode={quantityMode}
                  align="right"
                  compact
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalesByClientInvoiceDetails({
  invoices,
  quantityMode,
}: {
  invoices: SalesByClientInvoice[];
  quantityMode: QuantityEntryMode;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
        Invoices ({invoices.length})
      </p>
      {invoices.map((invoice) => (
        <div
          key={`${invoice.invoiceNumber}-${invoice.warehouse}`}
          className="overflow-hidden rounded-xl border border-stone-200 bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/80 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-900">
                {invoice.invoiceNumber || "—"}
              </p>
              <p className="text-xs text-stone-500">
                {formatCell(invoice.date)} · {invoice.warehouse}
                {invoice.clientName ? ` · ${invoice.clientName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                Invoice total
              </p>
              <ReportQuantityValue
                quantity={invoice.totalQuantity}
                product={invoice.lines[0]}
                quantityMode={quantityMode}
                align="right"
              />
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-left">Brand</th>
                <th className="px-4 py-2 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, lineIndex) => (
                <tr
                  key={`${line.product}-${line.brand}-${lineIndex}`}
                  className="border-t border-stone-100"
                >
                  <td className="px-4 py-2 font-medium text-stone-800">{line.product}</td>
                  <td className="px-4 py-2 text-stone-600">{line.brand}</td>
                  <td className="px-4 py-2 text-right">
                    <ReportQuantityValue
                      quantity={line.quantity}
                      product={line}
                      quantityMode={quantityMode}
                      align="right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ReportQuantityValue({
  quantity,
  product,
  quantityMode,
  align,
  compact = false,
}: {
  quantity: number;
  product?: {
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
  };
  quantityMode: QuantityEntryMode;
  align: "left" | "right";
  /** Single-line qty text — avoids stacked cartons/pcs breaking inline headers. */
  compact?: boolean;
}) {
  const rowProduct = {
    stockUnit: product?.stockUnit,
    unitsPerStockUnit: product?.unitsPerStockUnit,
    baseUnit: product?.baseUnit,
  };

  if (quantityMode === "units" || !usesStockUnit(rowProduct) || compact) {
    const text =
      quantityMode === "units" || !usesStockUnit(rowProduct)
        ? formatBaseUnits(quantity, rowProduct)
        : formatBaseQuantityWithStockUnit(quantity, rowProduct);
    return (
      <span
        className={`whitespace-nowrap font-bold tabular-nums text-stone-900 ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {text}
      </span>
    );
  }

  return (
    <StockQuantityDisplay
      quantity={quantity}
      stockUnit={rowProduct.stockUnit}
      unitsPerStockUnit={rowProduct.unitsPerStockUnit}
      baseUnit={rowProduct.baseUnit}
      size="sm"
      align={align}
    />
  );
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
