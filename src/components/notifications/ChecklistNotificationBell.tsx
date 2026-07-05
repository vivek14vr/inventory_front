"use client";

import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type ChecklistNotificationBellProps = {
  notificationsHref: string;
  checklistsHref?: string;
  align?: "left" | "right";
};

export function ChecklistNotificationBell(props: ChecklistNotificationBellProps) {
  const { user } = useAuth();
  if (!user) return null;
  return <NotificationBell {...props} />;
}
