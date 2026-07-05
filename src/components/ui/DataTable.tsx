type DataTableProps = {
  children: React.ReactNode;
  className?: string;
};

export function DataTable({ children, className = "" }: DataTableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-zinc-100 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {children}
      </tr>
    </thead>
  );
}

export function DataTableTh({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-zinc-50">{children}</tbody>;
}

export function DataTableRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="text-zinc-700 transition hover:bg-zinc-50/80">{children}</tr>
  );
}

export function DataTableTd({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3.5 ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
