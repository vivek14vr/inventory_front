import type { StockMovement } from "@/types/stock";

const INVOICE_QTY_CORRECTION_PREFIX = "invoice quantity correction";

function notesLower(m: StockMovement): string {
  return m.notes?.trim().toLowerCase() ?? "";
}

export function movementTypeLabel(m: StockMovement): string {
  const notes = notesLower(m);

  if (notes.startsWith(INVOICE_QTY_CORRECTION_PREFIX)) {
    return "Invoice edit";
  }
  if (m.relatedSaleMovementId || notes.includes("client return")) {
    return "Return";
  }
  if (notes.includes("adjustment")) {
    return "Adjustment";
  }
  if (m.dispatchType === "TRANSFER") {
    return m.type === "STOCK_IN" ? "Transfer in" : "Transfer out";
  }
  if (m.dispatchType === "DIRECT_SELLING") {
    return "Sale";
  }
  return m.type === "STOCK_IN" ? "Stock In" : "Stock Out";
}

export function movementTypeBadgeClass(m: StockMovement): string {
  const label = movementTypeLabel(m);
  if (label === "Return") return "bg-emerald-100 text-emerald-800";
  if (label === "Invoice edit") return "bg-sky-100 text-sky-800";
  if (label === "Adjustment") return "bg-violet-100 text-violet-800";
  if (label.startsWith("Transfer")) return "bg-indigo-100 text-indigo-800";
  if (label === "Sale") return "bg-amber-100 text-amber-800";
  if (m.type === "STOCK_IN") return "bg-orange-100 text-orange-800";
  return "bg-amber-100 text-amber-800";
}

export function movementDetails(m: StockMovement): string {
  if (m.dispatchType === "TRANSFER") {
    return m.destinationWarehouse?.code
      ? `Transfer → ${m.destinationWarehouse.code}`
      : m.notes?.trim() || "Transfer";
  }

  if (m.dispatchType === "DIRECT_SELLING") {
    return [m.clientName, m.invoiceNumber].filter(Boolean).join(" · ");
  }

  const notes = m.notes?.trim() ?? "";
  if (notes.toLowerCase().startsWith(INVOICE_QTY_CORRECTION_PREFIX)) {
    return notes;
  }

  if (m.relatedSaleMovementId || notes.toLowerCase().includes("client return")) {
    const party = [m.clientName, m.invoiceNumber].filter(Boolean).join(" · ");
    return party || notes || "Client return";
  }

  if (m.clientName || m.invoiceNumber) {
    return [m.clientName, m.invoiceNumber].filter(Boolean).join(" · ");
  }

  return notes;
}
