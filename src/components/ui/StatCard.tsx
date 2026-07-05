type StatCardProps = {
  label: string;
  value?: string | number;
  valueNode?: React.ReactNode;
  hint?: React.ReactNode;
  variant?: "default" | "warning" | "success" | "info";
  icon?: React.ReactNode;
};

const variantStyles = {
  default: "border-zinc-200/80 bg-white",
  warning: "border-amber-200/80 bg-amber-50/50",
  success: "border-orange-200/80 bg-orange-50/40",
  info: "border-sky-200/80 bg-sky-50/40",
};

const iconBg = {
  default: "bg-zinc-100 text-zinc-600",
  warning: "bg-amber-100 text-amber-700",
  success: "bg-orange-100 text-orange-700",
  info: "bg-sky-100 text-sky-700",
};

export function StatCard({
  label,
  value,
  valueNode,
  hint,
  variant = "default",
  icon,
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm shadow-zinc-900/[0.03] transition hover:shadow-md hover:shadow-zinc-900/[0.05] ${variantStyles[variant]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">
            {valueNode ?? value}
          </div>
          {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
        </div>
        {icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
