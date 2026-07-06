"use client";

import { WrongInvoicePanel } from "@/components/stock/WrongInvoicePanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AppWrongInvoicePage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Invoices"
        description="View invoice records and correct product quantities on sales lines."
      />
      <WrongInvoicePanel />
    </div>
  );
}
