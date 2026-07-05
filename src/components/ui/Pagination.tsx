"use client";

import { PAGE_SIZE_OPTIONS, type PaginationMeta } from "@/types/pagination";

type PaginationProps = {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
};

function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return [...new Set(pages.filter((p, i, arr) => p !== arr[i - 1]))];
}

export function Pagination({
  pagination,
  onPageChange,
  onLimitChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className = "",
}: PaginationProps) {
  const { page, limit, total, totalPages, hasPrevPage, hasNextPage, from, to } =
    pagination;

  if (total === 0) {
    return (
      <div
        className={`flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between ${className}`}
      >
        <span>No results</span>
        {onLimitChange && (
          <PageSizeSelect limit={limit} onLimitChange={onLimitChange} options={pageSizeOptions} />
        )}
      </div>
    );
  }

  const pages = pageNumbers(page, totalPages);

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm text-zinc-600">
        Showing <span className="font-medium text-zinc-900">{from}</span>–
        <span className="font-medium text-zinc-900">{to}</span> of{" "}
        <span className="font-medium text-zinc-900">{total.toLocaleString()}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {onLimitChange && (
          <PageSizeSelect limit={limit} onLimitChange={onLimitChange} options={pageSizeOptions} />
        )}

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <NavButton
            disabled={!hasPrevPage}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z"
                clipRule="evenodd"
              />
            </svg>
          </NavButton>

          {pages.map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`e-${idx}`} className="px-2 text-zinc-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`min-w-[2.25rem] rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                  p === page
                    ? "bg-orange-700 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {p}
              </button>
            )
          )}

          <NavButton
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </NavButton>
        </nav>
      </div>
    </div>
  );
}

function NavButton({
  children,
  disabled,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-zinc-200 p-2 text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

function PageSizeSelect({
  limit,
  onLimitChange,
  options,
}: {
  limit: number;
  onLimitChange: (n: number) => void;
  options: readonly number[];
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600">
      <span className="whitespace-nowrap">Rows per page</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => {
          const active = n === limit;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              onClick={() => onLimitChange(n)}
              className={`min-h-9 min-w-9 rounded-lg border-2 px-3 text-sm font-bold transition ${
                active
                  ? "border-orange-600 bg-orange-600 text-white shadow-sm"
                  : "border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:bg-orange-50"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
