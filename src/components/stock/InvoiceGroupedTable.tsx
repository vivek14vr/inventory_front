"use client";

import { Button } from "@/components/ui/Button";
import { formatBaseUnits } from "@/lib/products/productUnits";
import type { InvoiceGroup, InvoiceGroupLine } from "@/types/stock";

type InvoiceGroupedTableProps = {
  groups: InvoiceGroup[];
  lastWorkedMovementId: string | null;
  groupDrafts: Record<string, { invoiceNumber: string; clientName: string }>;
  lineDrafts: Record<string, { quantity: string }>;
  savingGroupId: string | null;
  savingLinesGroupId: string | null;
  flaggingId: string | null;
  deletingId: string | null;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: InvoiceSortField) => void;
  onGroupDraftChange: (
    groupId: string,
    patch: Partial<{ invoiceNumber: string; clientName: string }>
  ) => void;
  onLineDraftChange: (movementId: string, quantity: string) => void;
  onSaveGroup: (group: InvoiceGroup) => void;
  onSaveGroupQuantities: (group: InvoiceGroup) => void;
  onToggleLastWorked: (group: InvoiceGroup) => void;
  onDeleteLine: (group: InvoiceGroup, line: InvoiceGroupLine) => void;
};

export type InvoiceSortField =
  | "invoiceLastWorkedAt"
  | "createdAt"
  | "type"
  | "clientName"
  | "quantity"
  | "invoiceNumber";

const INVOICE_HEAD =
  "flex min-h-[2.75rem] items-center border-b border-stone-200 pb-2 mb-1";
const LINE_ROW =
  "flex min-h-[2.75rem] items-center border-b border-stone-100 py-1 last:border-b-0";

function formatVoucherDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .replace(/ /g, "-");
}

function isEditableSaleLine(line: InvoiceGroupLine): boolean {
  return line.type === "STOCK_OUT" && line.dispatchType === "DIRECT_SELLING";
}

function productParticulars(line: InvoiceGroupLine): string {
  if (line.secondaryProductName?.trim()) {
    return `${line.productName} (${line.secondaryProductName.trim()})`;
  }
  return line.productName;
}

export function InvoiceGroupedTable({
  groups,
  lastWorkedMovementId,
  groupDrafts,
  lineDrafts,
  savingGroupId,
  savingLinesGroupId,
  flaggingId,
  deletingId,
  sortBy,
  sortOrder,
  onSort,
  onGroupDraftChange,
  onLineDraftChange,
  onSaveGroup,
  onSaveGroupQuantities,
  onToggleLastWorked,
  onDeleteLine,
}: InvoiceGroupedTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-100 text-xs font-bold uppercase tracking-wide text-stone-700">
              <SortableTh
                label="Date"
                field="createdAt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <th className="border-l border-stone-300 px-4 py-3">Particulars</th>
              <SortableTh
                label="Client"
                field="clientName"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <SortableTh
                label="Voucher type"
                field="type"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <SortableTh
                label="Voucher no."
                field="invoiceNumber"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <SortableTh
                label="Quantity"
                field="quantity"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <th className="border-l border-stone-300 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIndex) => {
              const groupDraft = groupDrafts[group.id] ?? {
                invoiceNumber: group.invoiceNumber,
                clientName: group.clientName,
              };
              const isLastWorked = group.lastWorkedMovementId === lastWorkedMovementId;
              const hasEditableLines = group.lines.some(isEditableSaleLine);

              return (
                <tr
                  key={group.id}
                  className={`border-t border-stone-200 align-top ${
                    isLastWorked
                      ? "bg-indigo-50/70"
                      : groupIndex % 2 === 0
                        ? "bg-white"
                        : "bg-stone-50/30"
                  }`}
                >
                  <td className="border-r border-stone-200 px-4 py-3 align-top text-stone-600">
                    <div className={INVOICE_HEAD}>
                      <span className="whitespace-nowrap font-medium">
                        {formatVoucherDate(group.createdAt)}
                      </span>
                    </div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={LINE_ROW} aria-hidden />
                    ))}
                  </td>
                  <td className="border-r border-stone-200 px-4 py-3 align-top">
                    <div className={INVOICE_HEAD}>
                      <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Products
                      </span>
                    </div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={`${LINE_ROW} flex-col items-start justify-center`}>
                        <span className="font-medium text-stone-800">
                          {productParticulars(line)}
                        </span>
                        {line.brandName ? (
                          <span className="text-xs text-stone-500">{line.brandName}</span>
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td className="border-r border-stone-200 px-4 py-3 align-top">
                    <div className={INVOICE_HEAD}>
                      <input
                        value={groupDraft.clientName}
                        onChange={(e) =>
                          onGroupDraftChange(group.id, { clientName: e.target.value })
                        }
                        className="form-input w-full min-w-[140px]"
                        placeholder="Client name"
                      />
                    </div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={LINE_ROW} aria-hidden />
                    ))}
                  </td>
                  <td className="border-r border-stone-200 px-4 py-3 align-top text-stone-700">
                    <div className={`${INVOICE_HEAD} font-medium`}>{group.voucherType}</div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={LINE_ROW} aria-hidden />
                    ))}
                  </td>
                  <td className="border-r border-stone-200 px-4 py-3 align-top">
                    <div className={INVOICE_HEAD}>
                      <input
                        value={groupDraft.invoiceNumber}
                        onChange={(e) =>
                          onGroupDraftChange(group.id, { invoiceNumber: e.target.value })
                        }
                        className="form-input w-full min-w-[120px]"
                        placeholder="Voucher no."
                      />
                    </div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={LINE_ROW} aria-hidden />
                    ))}
                  </td>
                  <td className="border-r border-stone-200 px-4 py-3 align-top">
                    <div className={INVOICE_HEAD} aria-hidden />
                    {group.lines.map((line) => {
                      const lineDraft = lineDrafts[line.movementId] ?? {
                        quantity: String(line.quantity),
                      };

                      return (
                        <div key={line.movementId} className={LINE_ROW}>
                          {isEditableSaleLine(line) ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={lineDraft.quantity}
                              onChange={(e) =>
                                onLineDraftChange(line.movementId, e.target.value)
                              }
                              className="form-input w-full min-w-[88px] tabular-nums"
                            />
                          ) : (
                            <span className="font-medium tabular-nums text-stone-900">
                              {formatBaseUnits(line.quantity, line)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className={`${INVOICE_HEAD} flex-wrap justify-end gap-1.5`}>
                      <button
                        type="button"
                        title={
                          isLastWorked
                            ? "Click to remove last worked flag"
                            : "Mark as last worked"
                        }
                        disabled={flaggingId !== null}
                        onClick={() => onToggleLastWorked(group)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                          isLastWorked
                            ? "border-indigo-400 bg-indigo-100 text-indigo-700"
                            : "border-stone-200 bg-white text-stone-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                        }`}
                      >
                        {flaggingId === group.lastWorkedMovementId ? "…" : "★"}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        loading={savingGroupId === group.id}
                        disabled={savingGroupId !== null && savingGroupId !== group.id}
                        onClick={() => onSaveGroup(group)}
                      >
                        Save invoice
                      </Button>
                      {hasEditableLines && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={savingLinesGroupId === group.id}
                          disabled={
                            savingLinesGroupId !== null && savingLinesGroupId !== group.id
                          }
                          onClick={() => onSaveGroupQuantities(group)}
                        >
                          Save quantities
                        </Button>
                      )}
                    </div>
                    {group.lines.map((line) => (
                      <div key={line.movementId} className={`${LINE_ROW} justify-end gap-2`}>
                        {isEditableSaleLine(line) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            loading={deletingId === line.movementId}
                            disabled={
                              deletingId !== null && deletingId !== line.movementId
                            }
                            className="!border-rose-200 !text-rose-800 hover:!bg-rose-50"
                            onClick={() => onDeleteLine(group, line)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {group.warehouse?.code ? (
                      <p className="mt-2 text-right text-xs text-stone-500">
                        {group.warehouse.code}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  align = "left",
}: {
  label: string;
  field: InvoiceSortField;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: InvoiceSortField) => void;
  align?: "left" | "center" | "right";
}) {
  const active = sortBy === field;
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={`border-l border-stone-300 px-4 py-3 ${alignClass}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition hover:text-stone-950 ${
          align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""
        } ${active ? "text-stone-950" : ""}`}
      >
        <span>{label}</span>
        <span className="inline-flex flex-col leading-none text-[9px] text-stone-500">
          <span className={active && sortOrder === "asc" ? "text-stone-900" : "opacity-40"}>
            ▲
          </span>
          <span className={active && sortOrder === "desc" ? "text-stone-900" : "opacity-40"}>
            ▼
          </span>
        </span>
      </button>
    </th>
  );
}
