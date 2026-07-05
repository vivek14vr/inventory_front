"use client";

import { WrongInvoicePanel } from "@/components/stock/WrongInvoicePanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AppWrongInvoicePage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Invoices"
        description="Correct client names, invoice numbers, and delete incorrect sale invoices when you have inventory adjustment access."
      />
      <WrongInvoicePanel />
    </div>
  );
}
