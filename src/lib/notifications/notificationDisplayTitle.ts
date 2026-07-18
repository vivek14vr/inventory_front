import type { AppNotification } from "@/types/notification";

/** Title shown in toasts / lists — includes admin sender for manual reminders. */
export function notificationDisplayTitle(n: AppNotification): string {
  if (n.type === "ADMIN_REMINDER") {
    const from = n.taskTitle?.trim();
    const base = n.title?.trim() || "Reminder";
    if (!from) return base;
    if (base.toLowerCase().includes(from.toLowerCase())) return base;
    return `${base} from ${from}`;
  }
  return n.title;
}
