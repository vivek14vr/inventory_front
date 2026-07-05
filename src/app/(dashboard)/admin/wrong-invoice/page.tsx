"use client";

import { WrongInvoicePanel } from "@/components/stock/WrongInvoicePanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminWrongInvoicePage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Invoices"
        description="View and correct client names and invoice numbers on all sales and returns."
      />
      <WrongInvoicePanel />
    </div>
  );
}
