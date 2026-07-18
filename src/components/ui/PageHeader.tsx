"use client";

import { DashboardNotificationBell } from "@/components/layout/DashboardNotificationBell";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-base leading-relaxed text-stone-500">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {actions}
        <DashboardNotificationBell />
      </div>
    </div>
  );
}
