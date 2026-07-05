"use client";

import { useToast, type ToastVariant } from "@/contexts/ToastContext";

const variantStyles: Record<ToastVariant, string> = {
  info: "border-indigo-200 bg-white text-stone-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  success: "border-green-200 bg-green-50 text-green-950",
};

const accentStyles: Record<ToastVariant, string> = {
  info: "bg-indigo-600",
  warning: "bg-amber-500",
  success: "bg-green-600",
};

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3 sm:right-6 sm:top-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto overflow-hidden rounded-2xl border-2 shadow-xl shadow-stone-900/10 ${variantStyles[toast.variant]}`}
          role="status"
        >
          <div className="flex gap-3 p-4">
            <div className={`mt-1 h-10 w-1 shrink-0 rounded-full ${accentStyles[toast.variant]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="mt-1 text-sm leading-snug opacity-90">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
