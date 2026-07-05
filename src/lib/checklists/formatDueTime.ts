/** Format HH:MM (24h) as a friendly local time, e.g. "10:00 AM". */
export function formatDueTime(dueTime: string): string {
  const [hours, minutes] = dueTime.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return dueTime;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
