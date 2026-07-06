"use client";

export type ButtonSelectOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type ButtonSelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ButtonSelectOption[];
  /** "wrap" = pill row that wraps (good for filters / short lists), "grid" = tile grid. */
  layout?: "wrap" | "grid";
  size?: "sm" | "md";
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  optionsClassName?: string;
};

/**
 * Large-button replacement for a native <select>. Each option is a tappable
 * button; the selected option is highlighted. Designed for touch-friendly UIs.
 */
export function ButtonSelect({
  label,
  value,
  onChange,
  options,
  layout = "wrap",
  size = "md",
  disabled,
  emptyMessage = "No options",
  className = "",
  optionsClassName = "",
}: ButtonSelectProps) {
  const containerClass =
    layout === "grid"
      ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      : "flex flex-wrap gap-2";

  const sizeClass =
    size === "sm"
      ? "min-h-10 rounded-xl px-4 py-2 text-sm"
      : "min-h-12 rounded-2xl px-5 py-3 text-base";

  return (
    <div className={className}>
      {label && (
        <span className="block text-sm font-semibold text-stone-700">{label}</span>
      )}
      <div
        className={`${label ? "mt-2" : ""} ${containerClass} ${optionsClassName}`.trim()}
      >
        {options.length === 0 ? (
          <p className="text-sm font-medium text-stone-400">{emptyMessage}</p>
        ) : (
          options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || "__empty__"}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange(option.value)}
                className={`${sizeClass} flex flex-col items-start justify-center text-left font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-2 border-orange-600 bg-orange-600 text-white shadow-md shadow-orange-900/20"
                    : "border-2 border-stone-200 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <span className="leading-tight">{option.label}</span>
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
            );
          })
        )}
      </div>
    </div>
  );
}
