"use client";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export type SelectionGridItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
};

const TILE_COLORS = [
  {
    tile: "border-orange-200 bg-orange-50 hover:border-orange-400 hover:bg-orange-100",
    icon: "bg-orange-600 text-white",
  },
  {
    tile: "border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100",
    icon: "bg-amber-500 text-white",
  },
  {
    tile: "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100",
    icon: "bg-sky-600 text-white",
  },
  {
    tile: "border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100",
    icon: "bg-violet-600 text-white",
  },
  {
    tile: "border-rose-200 bg-rose-50 hover:border-rose-400 hover:bg-rose-100",
    icon: "bg-rose-600 text-white",
  },
  {
    tile: "border-teal-200 bg-teal-50 hover:border-teal-400 hover:bg-teal-100",
    icon: "bg-teal-600 text-white",
  },
] as const;

type SelectionGridProps = {
  title: string;
  subtitle?: string;
  items: SelectionGridItem[];
  onSelect: (id: string) => void;
  onBack?: () => void;
  backLabel?: string;
  loading?: boolean;
  emptyMessage?: string;
};

export function SelectionGrid({
  title,
  subtitle,
  items,
  onSelect,
  onBack,
  backLabel = "Back",
  loading,
  emptyMessage = "Nothing available",
}: SelectionGridProps) {
  return (
    <div className="space-y-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-stone-200 bg-white px-5 text-base font-bold text-stone-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path
              fillRule="evenodd"
              d="M11.78 4.22a.75.75 0 010 1.06L7.56 9.5h8.19a.75.75 0 010 1.5H7.56l4.22 4.22a.75.75 0 11-1.06 1.06l-5.5-5.5a.75.75 0 010-1.06l5.5-5.5a.75.75 0 011.06 0z"
              clipRule="evenodd"
            />
          </svg>
          {backLabel}
        </button>
      )}

      <div>
        <h2 className="text-xl font-bold text-stone-900 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-base text-stone-500">{subtitle}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading…" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center">
          <p className="text-base font-medium text-stone-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => {
            const color = TILE_COLORS[index % TILE_COLORS.length];
            const initial = item.title.trim().charAt(0).toUpperCase() || "?";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`relative flex min-h-[130px] flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 text-center transition active:scale-[0.98] ${color.tile}`}
              >
                {item.badge && (
                  <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {item.badge}
                  </span>
                )}
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold shadow-md ${color.icon}`}
                >
                  {initial}
                </span>
                <span className="text-base font-bold leading-tight text-stone-900">
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="text-sm font-medium text-stone-500">{item.subtitle}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
