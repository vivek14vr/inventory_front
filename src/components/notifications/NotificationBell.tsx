"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDueTime } from "@/lib/checklists/formatDueTime";

type NotificationBellProps = {
  notificationsHref: string;
  checklistsHref?: string;
  align?: "left" | "right";
};

export function NotificationBell({
  notificationsHref,
  checklistsHref,
  align = "right",
}: NotificationBellProps) {
  const { notifications, unreadCount, markRead, markAllRead, refresh } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const active = notifications.filter((n) => !n.resolved).slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border-2 border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-[min(100vw-2rem,340px)] overflow-hidden rounded-2xl border-2 border-stone-200 bg-white text-left shadow-xl shadow-stone-900/10 ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="text-sm font-bold text-stone-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {active.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">
                No notifications
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {active.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) void markRead(n.id);
                      }}
                      className={`w-full px-4 py-3 text-left transition hover:bg-orange-50/60 ${
                        n.read ? "opacity-70" : "bg-orange-50/30"
                      }`}
                    >
                      <p className="text-sm font-bold text-stone-900">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-snug text-stone-600">
                        {n.message}
                      </p>
                      {n.dueTime && (
                        <p className="mt-1 text-[11px] font-medium text-indigo-700">
                          Due {formatDueTime(n.dueTime)}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex border-t border-stone-100">
            <Link
              href={notificationsHref}
              onClick={() => setOpen(false)}
              className={`py-3 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50 ${
                checklistsHref ? "flex-1" : "w-full"
              }`}
            >
              View all
            </Link>
            {checklistsHref && (
              <Link
                href={checklistsHref}
                onClick={() => setOpen(false)}
                className="flex-1 border-l border-stone-100 py-3 text-center text-sm font-semibold text-orange-700 hover:bg-orange-50"
              >
                Open tasks
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
