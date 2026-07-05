"use client";

import { ReturnPanel } from "@/components/stock/ReturnPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminReturnPage() {
  return (
    <div className="space-y-6 text-zinc-900">
      <PageHeader
        title="Return"
        description="Record goods returned from a client or send stock back to another warehouse."
      />
      <ReturnPanel requireWarehouse />
    </div>
  );
}
