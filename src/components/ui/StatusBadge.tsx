const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 ring-amber-200/80",
  RECEIVED: "bg-orange-100 text-orange-900 ring-orange-200/80",
  CANCELLED: "bg-red-100 text-red-900 ring-red-200/80",
  RETURNED: "bg-violet-100 text-violet-900 ring-violet-200/80",
  active: "bg-orange-100 text-orange-900 ring-orange-200/80",
  inactive: "bg-zinc-100 text-zinc-600 ring-zinc-200/80",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
};

type StatusBadgeProps =
  | { status: string; label?: string; active?: never }
  | { active: boolean; status?: never; label?: never };

export function StatusBadge(props: StatusBadgeProps) {
  if ("active" in props && props.active !== undefined) {
    return <ActiveBadge active={props.active} />;
  }

  const { status, label } = props;
  const text = label ?? STATUS_LABELS[status] ?? status;
  const style =
    STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200/80";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style}`}
    >
      {text}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const key = active ? "active" : "inactive";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[key]}`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
