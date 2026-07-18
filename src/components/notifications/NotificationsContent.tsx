"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { formatDueTime } from "@/lib/checklists/formatDueTime";
import { notificationDisplayTitle } from "@/lib/notifications/notificationDisplayTitle";
import type { AppNotification } from "@/types/notification";

type NotificationsContentProps = {
  checklistsHref: string;
};

export function NotificationsContent({ checklistsHref }: NotificationsContentProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await api.notifications.sync();
      const result = await api.notifications.list({
        ...(showResolved ? {} : { resolved: false }),
        limit: 100,
      });
      setNotifications(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMarkRead(id: string) {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark as read");
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark all as read");
    }
  }

  const active = notifications.filter((n) => !n.resolved);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Checklist reminders stay here until you complete the task."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Link href={checklistsHref}>
              <Button>Open daily tasks</Button>
            </Link>
          </>
        }
      />

      <Alert message={error} />

      <Panel
        title="Your alerts"
        description={`${active.length} active reminder${active.length === 1 ? "" : "s"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="text-sm font-semibold text-stone-600 hover:text-stone-900"
            >
              {showResolved ? "Hide resolved" : "Show resolved"}
            </button>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              Mark all read
            </button>
          </div>
        }
      >
        {loading ? (
          <LoadingSpinner label="Loading notifications…" />
        ) : notifications.length === 0 ? (
          <p className="text-stone-500">No notifications yet.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border-2 p-4 ${
                  n.resolved
                    ? "border-stone-200 bg-stone-50 opacity-70"
                    : n.read
                      ? "border-stone-200 bg-white"
                      : n.reminderKey.startsWith("after_")
                        ? "border-amber-300 bg-amber-50/50"
                        : "border-indigo-200 bg-indigo-50/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-900">
                      {notificationDisplayTitle(n)}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">{n.message}</p>
                    <p className="mt-2 text-xs text-stone-400">
                      {n.type === "ADMIN_REMINDER"
                        ? `From ${n.taskTitle || "Administrator"}`
                        : `${n.checklistTitle} · ${n.taskTitle}`}
                      {n.dueTime ? ` · due ${formatDueTime(n.dueTime)}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {new Date(n.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  {!n.read && !n.resolved && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleMarkRead(n.id)}
                    >
                      Mark read
                    </Button>
                  )}
                  {n.resolved && (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800">
                      Completed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
