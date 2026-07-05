type PanelProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
};

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  noPadding,
}: PanelProps) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-zinc-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className={noPadding ? "" : "p-5 sm:p-6"}>{children}</div>
    </section>
  );
}
