"use client";

import { useEffect, useRef, useState } from "react";

export type SelectMenuOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type SelectMenuProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Compact dropdown selector. Shows the current selection as a single control and
 * reveals the options in a popover on click — a space-saving alternative to the
 * inline button grid used by ButtonSelect.
 */
export function SelectMenu({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className = "",
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={className} ref={ref}>
      {label && (
        <label className="block text-sm font-semibold text-stone-700">{label}</label>
      )}
      <div className={`relative ${label ? "mt-1.5" : ""}`}>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3.5 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            open
              ? "border-orange-400 bg-white"
              : "border-stone-200 bg-white hover:border-orange-300"
          }`}
        >
          <span className={selected ? "text-stone-900" : "text-stone-400"}>
            {selected ? selected.label : placeholder}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border-2 border-stone-200 bg-white p-1.5 shadow-xl shadow-stone-900/10"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value || "__empty__"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-orange-600 text-white"
                        : "text-stone-700 hover:bg-orange-50"
                    }`}
                  >
                    <span className="font-semibold leading-tight">{option.label}</span>
                    {option.sublabel && (
                      <span
                        className={`text-xs font-medium ${
                          active ? "text-orange-100" : "text-stone-400"
                        }`}
                      >
                        {option.sublabel}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
