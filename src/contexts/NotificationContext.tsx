"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import type { AppNotification } from "@/types/notification";
import { notificationDisplayTitle } from "@/lib/notifications/notificationDisplayTitle";

const SHOWN_KEY = "inventory_toast_shown_ids";
const POLL_MS = 15_000;

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function loadShownIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveShownIds(ids: Set<string>) {
  try {
    const arr = [...ids].slice(-200);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function toastVariant(n: AppNotification): "info" | "warning" | "success" {
  if (n.type === "ADMIN_REMINDER") return "warning";
  if (n.reminderKey.startsWith("after_") || n.isPastDue) return "warning";
  if (n.reminderKey === "pending") return "info";
  return "info";
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { pushToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const shownIds = useRef<Set<string>>(loadShownIds());
  const canUse = !!user;

  const showNewToasts = useCallback(
    (items: AppNotification[]) => {
      for (const n of items) {
        if (n.resolved || shownIds.current.has(n.id)) continue;
        shownIds.current.add(n.id);
        pushToast({
          title: notificationDisplayTitle(n),
          message: n.message,
          variant: toastVariant(n),
          durationMs: 5000,
        });
      }
      saveShownIds(shownIds.current);
    },
    [pushToast]
  );

  const refresh = useCallback(async () => {
    if (!canUse) return;
    setLoading(true);
    try {
      const poll = await api.notifications.poll();

      const toToast = [...poll.sync.notifications];
      for (const n of poll.items) {
        if (
          !n.read &&
          !n.resolved &&
          !toToast.some((x) => x.id === n.id)
        ) {
          toToast.push(n);
        }
      }
      showNewToasts(toToast);
      setNotifications(poll.items);
      setUnreadCount(poll.unreadCount);
    } catch {
      // silent — notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [canUse, showNewToasts]);

  const markRead = useCallback(
    async (id: string) => {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    []
  );

  const markAllRead = useCallback(async () => {
    await api.notifications.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (authLoading || !canUse) return;
    void refresh();
    const handle = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(handle);
  }, [authLoading, canUse, refresh]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh,
      markRead,
      markAllRead,
    }),
    [notifications, unreadCount, loading, refresh, markRead, markAllRead]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
