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

export type ToastVariant = "info" | "warning" | "success";

export type ToastItem = {
  id: string;
  title: string;
  message: string;
  variant: ToastVariant;
  durationMs?: number;
  /** True while exit animation plays before removal. */
  exiting?: boolean;
};

type ToastContextValue = {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id" | "exiting">) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const EXIT_MS = 260;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const exitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    clearTimer(id);
    const exitTimer = exitTimers.current.get(id);
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [clearTimer]);

  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);
      if (exitTimers.current.has(id)) return;

      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );

      const exitTimer = setTimeout(() => removeToast(id), EXIT_MS);
      exitTimers.current.set(id, exitTimer);
    },
    [clearTimer, removeToast]
  );

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id" | "exiting">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = { ...toast, id };
      setToasts((prev) => [...prev.slice(-4), item]);

      const duration = toast.durationMs ?? 5000;
      const timer = setTimeout(() => dismissToast(id), duration);
      timers.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const auto = timers.current;
    const exits = exitTimers.current;
    return () => {
      auto.forEach((timer) => clearTimeout(timer));
      auto.clear();
      exits.forEach((timer) => clearTimeout(timer));
      exits.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
