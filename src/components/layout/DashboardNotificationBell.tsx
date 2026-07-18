"use client";

import { ChecklistNotificationBell } from "@/components/notifications/ChecklistNotificationBell";
import { useDashboardChrome } from "@/components/layout/DashboardChromeContext";

/** Desktop page-header notification control. Hidden on mobile (shell header has it). */
export function DashboardNotificationBell({
  className = "",
}: {
  className?: string;
}) {
  const { notificationsHref, checklistsHref } = useDashboardChrome();
  if (!notificationsHref) return null;

  return (
    <div className={`hidden shrink-0 lg:block ${className}`.trim()}>
      <ChecklistNotificationBell
        notificationsHref={notificationsHref}
        checklistsHref={checklistsHref}
        align="right"
      />
    </div>
  );
}
