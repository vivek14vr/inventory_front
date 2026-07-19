import { formatSecondaryName } from "@/lib/products/productNames";
import {
  formatBaseQuantityWithStockUnit,
  formatBaseUnits,
  type QuantityEntryMode,
  usesStockUnit,
} from "@/lib/products/productUnits";
import {
  movementDetails,
  movementFilterKindLabel,
  movementTypeLabel,
} from "@/lib/inventory/movementDisplay";
import { escapeHtml, openPrintWindow } from "@/lib/reports/printReport";
import type {
  LowStockProductRow,
  LowStockResponse,
  StockProductRow,
  StockResponse,
  StockWarehouseColumn,
} from "@/types/inventory";
import type { StockMovement } from "@/types/stock";

export type CheckStockPdfFilters = {
  tab: "stock" | "movements" | "low-stock";
  tabLabel: string;
  warehouseName?: string;
  brandName?: string;
  search?: string;
  movementType?: string;
  sortBy?: string;
  sortOrder?: string;
};

function formatGeneratedAt(): string {
  return new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatFilterSummary(filters: CheckStockPdfFilters): string {
  const parts: string[] = [`View: ${filters.tabLabel}`];
  if (filters.warehouseName) parts.push(`Warehouse: ${filters.warehouseName}`);
  if (filters.brandName) parts.push(`Brand: ${filters.brandName}`);
  if (filters.search?.trim()) parts.push(`Search: ${filters.search.trim()}`);
  if (filters.movementType) {
    parts.push(`Movement: ${movementFilterKindLabel(filters.movementType)}`);
  }
  if (filters.sortBy) {
    parts.push(`Sort: ${filters.sortBy} (${filters.sortOrder ?? "desc"})`);
  }
  return parts.join(" · ");
}

function quantityText(
  quantity: number,
  product?: {
    stockUnit?: string;
    unitsPerStockUnit?: number;
    baseUnit?: string;
  },
  mode: QuantityEntryMode = "stockUnit"
): string {
  if (!product) return String(quantity);
  if (mode === "units" || !usesStockUnit(product)) {
    return formatBaseUnits(quantity, product);
  }
  return formatBaseQuantityWithStockUnit(quantity, product);
}

function formatLastChange(
  change?: { type: "STOCK_IN" | "STOCK_OUT"; quantity: number; createdAt: string } | null,
  updatedAt?: string | null
): string {
  const timing = updatedAt ?? change?.createdAt;
  const timingLabel = timing ? formatDateTime(timing) : "";
  if (!change) return timingLabel || "—";
  const sign = change.type === "STOCK_IN" ? "+" : "−";
  return `${sign}${change.quantity.toLocaleString()}${timingLabel ? ` · ${timingLabel}` : ""}`;
}

function productLabel(product: Pick<StockProductRow, "productName" | "secondaryProductName">): string {
  const secondary = product.secondaryProductName?.trim();
  return secondary ? `${product.productName} (${secondary})` : product.productName;
}

function th(label: string, align: "left" | "right" = "left"): string {
  return `<th style="text-align:${align};padding:8px;border:1px solid #e4e4e7;">${escapeHtml(label)}</th>`;
}

function td(
  value: string,
  align: "left" | "right" = "left",
  options?: { html?: boolean }
): string {
  const content = options?.html ? value : escapeHtml(value);
  return `<td style="padding:8px;border:1px solid #e4e4e7;text-align:${align};">${content}</td>`;
}

function wrapReport(title: string, filterLine: string, tableHtml: string, summary?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: system-ui, sans-serif; color: #18181b; padding: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #fff7ed; }
  </style>
</head>
<body>
  <header style="margin-bottom:20px;border-bottom:2px solid #ea580c;padding-bottom:12px;">
    <h1 style="margin:0;font-size:20px;">${escapeHtml(title)}</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#71717a;">Generated ${escapeHtml(formatGeneratedAt())}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#52525b;">${escapeHtml(filterLine)}</p>
    ${summary ? `<p style="margin:4px 0 0;font-size:12px;color:#52525b;">${escapeHtml(summary)}</p>` : ""}
  </header>
  ${tableHtml}
</body>
</html>`;
}

function buildStockTable(
  data: StockResponse,
  showTotalColumn: boolean
): string {
  const warehouseColumns: StockWarehouseColumn[] = data.warehouses?.length
    ? data.warehouses
    : data.summary.byWarehouse.map((w) => ({
        warehouseId: w.warehouseId,
        name: w.name,
        code: w.code,
      }));
  const products = data.products ?? [];

  if (warehouseColumns.length === 1) {
    const wh = warehouseColumns[0]!;
    const rows = products.map((product) => {
      const loc = product.locations.find((l) => l.warehouseId === wh.warehouseId);
      return `<tr>
        ${td(productLabel(product))}
        ${td(formatSecondaryName(product.secondaryProductName))}
        ${td(product.brandName)}
        ${td(loc ? quantityText(loc.quantity, product) : "—", "right")}
        ${td(formatLastChange(loc?.lastChange, loc?.updatedAt))}
      </tr>`;
    });

    return `<table>
      <thead><tr>
        ${th("Product")}
        ${th("Secondary name")}
        ${th("Brand")}
        ${th("Quantity", "right")}
        ${th("Last change")}
      </tr></thead>
      <tbody>${rows.join("") || `<tr><td colspan="5" style="padding:12px;">No products found</td></tr>`}</tbody>
    </table>`;
  }

  const headerCells = [
    th("Product"),
    th("Secondary name"),
    th("Brand"),
    th("Warehouse"),
    th("Quantity", "right"),
    th("Last change"),
    ...(showTotalColumn ? [th("Total", "right")] : []),
  ];

  const bodyRows: string[] = [];
  for (const product of products) {
    const locations =
      product.locations.length > 0
        ? product.locations
        : [{ warehouseId: "", warehouseName: "—", warehouseCode: "—", quantity: 0, updatedAt: "" }];

    locations.forEach((loc, index) => {
      const wh =
        warehouseColumns.find((w) => w.warehouseId === loc.warehouseId) ??
        ({ name: loc.warehouseName, code: loc.warehouseCode } as StockWarehouseColumn);
      bodyRows.push(`<tr>
        ${td(index === 0 ? productLabel(product) : "")}
        ${td(index === 0 ? formatSecondaryName(product.secondaryProductName) : "")}
        ${td(index === 0 ? product.brandName : "")}
        ${td(`${wh.name} (${wh.code})`)}
        ${td(loc.quantity > 0 || loc.warehouseId ? quantityText(loc.quantity, product) : "—", "right")}
        ${td(formatLastChange(loc.lastChange, loc.updatedAt))}
        ${showTotalColumn ? td(index === 0 ? quantityText(product.totalQuantity, product) : "", "right") : ""}
      </tr>`);
    });
  }

  return `<table>
    <thead><tr>${headerCells.join("")}</tr></thead>
    <tbody>${bodyRows.join("") || `<tr><td colspan="${headerCells.length}" style="padding:12px;">No products found</td></tr>`}</tbody>
  </table>`;
}

function buildMovementsTable(movements: StockMovement[]): string {
  const rows = movements.map((m) => {
    const secondary = formatSecondaryName(m.product?.secondaryName);
    const productCell =
      secondary !== "—"
        ? `${escapeHtml(m.product?.name ?? "—")}<br/><span style="font-size:11px;color:#78716c;">${escapeHtml(secondary)}</span>`
        : escapeHtml(m.product?.name ?? "—");
    const remaining =
      m.remainingStock === undefined
        ? "—"
        : quantityText(m.remainingStock, m.product);

    return `<tr>
      ${td(formatDateTime(m.createdAt))}
      ${td(movementTypeLabel(m))}
      ${td(productCell, "left", { html: true })}
      ${td(m.brand?.name ?? "—")}
      ${td(m.warehouse?.code ?? "—")}
      ${td(movementDetails(m))}
      ${td(quantityText(m.quantity, m.product), "right")}
      ${td(remaining, "right")}
    </tr>`;
  });

  return `<table>
    <thead><tr>
      ${th("Date")}
      ${th("Type")}
      ${th("Product")}
      ${th("Brand")}
      ${th("Warehouse")}
      ${th("Details")}
      ${th("Quantity", "right")}
      ${th("Remaining stock", "right")}
    </tr></thead>
    <tbody>${rows.join("") || `<tr><td colspan="8" style="padding:12px;">No movements</td></tr>`}</tbody>
  </table>`;
}

function normalizeLowStockRow(row: LowStockProductRow): LowStockProductRow {
  const legacy = row as LowStockProductRow & {
    warehouseId?: string;
    quantity?: number;
    lowStockThreshold?: number;
    warehouseLowStockThreshold?: number;
  };
  if (
    legacy.warehouseId &&
    (!row.warehouseLow || Object.keys(row.warehouseLow).length === 0)
  ) {
    return {
      ...row,
      warehouseLow: { [legacy.warehouseId]: legacy.quantity ?? 0 },
      warehouseThreshold:
        legacy.lowStockThreshold != null
          ? { [legacy.warehouseId]: legacy.lowStockThreshold }
          : {},
      warehouseThresholdCustom:
        legacy.warehouseLowStockThreshold != null
          ? { [legacy.warehouseId]: true }
          : {},
    };
  }
  return {
    ...row,
    warehouseLow: row.warehouseLow ?? {},
    warehouseThreshold: row.warehouseThreshold ?? {},
    warehouseThresholdCustom: row.warehouseThresholdCustom ?? {},
  };
}

function buildLowStockTable(
  data: LowStockResponse,
  quantityMode: QuantityEntryMode
): string {
  const warehouseColumns = data.warehouses ?? [];
  const products = data.items ?? [];

  const headerCells = [
    th("Product"),
    th("Brand"),
    th("Total stock", "right"),
    ...warehouseColumns.map((wh) => th(wh.name, "right")),
  ];

  const stockWithThreshold = (
    quantity: number | undefined,
    threshold: number | undefined,
    unitProduct: {
      stockUnit?: string;
      unitsPerStockUnit?: number;
      baseUnit?: string;
    },
    thresholdSuffix?: string
  ) => {
    const qty =
      quantity != null ? quantityText(quantity, unitProduct, quantityMode) : "—";
    if (threshold == null) return escapeHtml(qty);
    const thresholdLabel = `≤ ${quantityText(threshold, unitProduct, quantityMode)}${
      thresholdSuffix ? ` ${thresholdSuffix}` : ""
    }`;
    return `${escapeHtml(qty)}<br/><span style="font-size:11px;color:#78716c;">${escapeHtml(thresholdLabel)}</span>`;
  };

  const rows = products.map((productRow) => {
    const product = normalizeLowStockRow(productRow);
    const warehouseLow = product.warehouseLow ?? {};
    const warehouseThreshold = product.warehouseThreshold ?? {};
    const warehouseThresholdCustom = product.warehouseThresholdCustom ?? {};
    const unitProduct = {
      stockUnit: product.stockUnit,
      unitsPerStockUnit: product.unitsPerStockUnit,
      baseUnit: product.baseUnit,
    };
    const warehouseCells = warehouseColumns.map((wh) => {
      const threshold = warehouseThreshold[wh.warehouseId];
      const suffix =
        threshold != null
          ? warehouseThresholdCustom[wh.warehouseId]
            ? "warehouse"
            : "default"
          : undefined;
      return td(
        stockWithThreshold(
          warehouseLow[wh.warehouseId],
          threshold,
          unitProduct,
          suffix
        ),
        "right",
        { html: true }
      );
    });

    return `<tr>
      ${td(productLabel(product))}
      ${td(product.brandName)}
      ${td(
        stockWithThreshold(
          product.totalQuantity,
          product.totalLowStockThreshold,
          unitProduct,
          product.totalLowStockThreshold != null ? "overall" : undefined
        ),
        "right",
        { html: true }
      )}
      ${warehouseCells.join("")}
    </tr>`;
  });

  return `<table>
    <thead><tr>${headerCells.join("")}</tr></thead>
    <tbody>${rows.join("") || `<tr><td colspan="${headerCells.length}" style="padding:12px;">No low stock items</td></tr>`}</tbody>
  </table>`;
}

export function printCurrentStockReport(
  data: StockResponse,
  options: { filters: CheckStockPdfFilters; showTotalColumn: boolean }
): void {
  const summary = `${data.summary.totalSkus.toLocaleString()} products · ${data.summary.byWarehouse.length} warehouse(s)`;
  const html = wrapReport(
    "Current Stock Report",
    formatFilterSummary(options.filters),
    buildStockTable(data, options.showTotalColumn),
    summary
  );
  openPrintWindow(html, "Current Stock Report");
}

export function printMovementsReport(
  movements: StockMovement[],
  filters: CheckStockPdfFilters
): void {
  const html = wrapReport(
    "Stock Movements Report",
    formatFilterSummary(filters),
    buildMovementsTable(movements),
    `${movements.length.toLocaleString()} movement(s)`
  );
  openPrintWindow(html, "Stock Movements Report");
}

export function printLowStockReport(
  data: LowStockResponse,
  filters: CheckStockPdfFilters,
  quantityMode: QuantityEntryMode
): void {
  const html = wrapReport(
    "Low Stock Report",
    formatFilterSummary(filters),
    buildLowStockTable(data, quantityMode),
    `${data.count.toLocaleString()} low-stock product(s)`
  );
  openPrintWindow(html, "Low Stock Report");
}
