"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export function ImportTip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/60 px-4 py-3 text-sm leading-relaxed text-stone-700">
      {children}
    </div>
  );
}

export function ImportExampleCard({
  title,
  footnote,
  children,
}: {
  title: string;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50/80">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200/80 bg-white px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
          {title}
        </p>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-500">
          First sheet
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footnote ? (
        <p className="border-t border-stone-200/80 bg-white px-4 py-3 text-xs leading-relaxed text-stone-500">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

type ImportUploadFormProps = {
  title: string;
  description: string;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  showReset: boolean;
  onFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  tip?: ReactNode;
  example?: ReactNode;
  submitLabel?: string;
};

export function ImportUploadForm({
  title,
  description,
  file,
  fileInputRef,
  loading,
  showReset,
  onFileChange,
  onSubmit,
  onReset,
  tip,
  example,
  submitLabel = "Upload & preview",
}: ImportUploadFormProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm shadow-stone-900/[0.03]">
      <div className="border-b border-stone-100 px-5 py-5 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
          Step 1 · Prepare & upload
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-stone-900">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500">
          {description}
        </p>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {tip}
        {example}

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition active:scale-[0.99] ${
              file
                ? "border-orange-300 bg-orange-50/50 hover:border-orange-400"
                : "border-stone-200 bg-stone-50/50 hover:border-orange-300 hover:bg-orange-50/40"
            }`}
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${
                file
                  ? "bg-orange-600 text-white"
                  : "bg-white text-stone-400 ring-1 ring-stone-200 group-hover:text-orange-600"
              }`}
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </span>
            <span className="text-base font-bold text-stone-900">
              {file ? file.name : "Drop or choose an Excel file"}
            </span>
            <span className="text-sm text-stone-500">
              {file
                ? "Click to choose a different .xlsx / .xls / .csv"
                : ".xlsx, .xls, or .csv · max 10 MB"}
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!file || loading} loading={loading}>
              {loading ? "Reading file…" : submitLabel}
            </Button>
            {showReset ? (
              <Button type="button" variant="secondary" size="lg" onClick={onReset}>
                Start over
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

export function ImportPreviewStats({
  items,
}: {
  items: Array<{ label: string; value: string | number; tone?: "default" | "info" | "success" | "danger" | "warning" }>;
}) {
  const toneClass = {
    default: "border-stone-200 bg-white text-stone-800",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  } as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-2xl border px-4 py-3 ${toneClass[item.tone ?? "default"]}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            {item.label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
