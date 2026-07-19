"use client";

import { TransferPanel } from "@/components/stock/TransferPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminTransferPage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Transfer"
        description="Send stock from one warehouse to another, or receive incoming transfers."
      />
      <TransferPanel showDestinationFilter />
    </div>
  );
}
