import Link from "next/link";
import { NavIcon } from "@/components/layout/NavIcon";

type TileColor = "orange" | "amber" | "sky" | "violet" | "rose" | "teal" | "emerald" | "indigo";

const colorStyles: Record<TileColor, { bg: string; icon: string; border: string }> = {
  orange: {
    bg: "bg-orange-50 group-hover:bg-orange-100",
    icon: "bg-orange-600 text-white",
    border: "group-hover:border-orange-300",
  },
  amber: {
    bg: "bg-amber-50 group-hover:bg-amber-100",
    icon: "bg-amber-500 text-white",
    border: "group-hover:border-amber-300",
  },
  sky: {
    bg: "bg-sky-50 group-hover:bg-sky-100",
    icon: "bg-sky-600 text-white",
    border: "group-hover:border-sky-300",
  },
  violet: {
    bg: "bg-violet-50 group-hover:bg-violet-100",
    icon: "bg-violet-600 text-white",
    border: "group-hover:border-violet-300",
  },
  rose: {
    bg: "bg-rose-50 group-hover:bg-rose-100",
    icon: "bg-rose-600 text-white",
    border: "group-hover:border-rose-300",
  },
  teal: {
    bg: "bg-teal-50 group-hover:bg-teal-100",
    icon: "bg-teal-600 text-white",
    border: "group-hover:border-teal-300",
  },
  emerald: {
    bg: "bg-emerald-50 group-hover:bg-emerald-100",
    icon: "bg-emerald-600 text-white",
    border: "group-hover:border-emerald-300",
  },
  indigo: {
    bg: "bg-indigo-50 group-hover:bg-indigo-100",
    icon: "bg-indigo-600 text-white",
    border: "group-hover:border-indigo-300",
  },
};

type QuickActionCardProps = {
  href: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  iconLabel?: string;
  badge?: string;
  size?: "default" | "large";
  color?: TileColor;
};

export function QuickActionCard({
  href,
  title,
  description,
  icon,
  iconLabel,
  badge,
  size = "default",
  color = "orange",
}: QuickActionCardProps) {
  const styles = colorStyles[color];

  if (size === "large") {
    return (
      <Link
        href={href}
        className={`group relative flex min-h-[148px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-stone-200 bg-white p-5 text-center shadow-sm transition active:scale-[0.98] hover:shadow-lg ${styles.border} ${styles.bg}`}
      >
        {badge && (
          <span className="absolute right-3 top-3 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {badge}
          </span>
        )}
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl shadow-md ${styles.icon}`}
        >
          {icon ?? (iconLabel ? <NavIcon label={iconLabel} /> : null)}
        </div>
        <div>
          <p className="text-lg font-bold text-stone-900">{title}</p>
          {description && (
            <p className="mt-1 text-sm font-medium text-stone-500">{description}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group flex items-start gap-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm shadow-stone-900/[0.03] transition hover:border-orange-200 hover:shadow-md hover:shadow-orange-900/[0.06]`}
    >
      {(icon || iconLabel) && (
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${styles.icon}`}
        >
          {icon ?? (iconLabel ? <NavIcon label={iconLabel} /> : null)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-stone-900">{title}</p>
          {badge && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        )}
      </div>
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-1 h-5 w-5 shrink-0 text-stone-300 transition group-hover:text-orange-600"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
          clipRule="evenodd"
        />
      </svg>
    </Link>
  );
}
