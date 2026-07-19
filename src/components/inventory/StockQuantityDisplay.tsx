import {
  formatBaseUnits,
  pluralizeStockUnit,
  splitBaseQuantity,
} from "@/lib/products/productUnits";

type StockQuantityDisplayProps = {
  quantity: number;
  stockUnit?: string;
  unitsPerStockUnit?: number;
  baseUnit?: string;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
  /** Prefix shown before the quantity, e.g. "+" / "−" for movement logs. */
  leadingSign?: "+" | "−" | "";
  /** Color the primary qty for stock-in / stock-out. */
  tone?: "neutral" | "in" | "out";
  className?: string;
};

const SIZE = {
  sm: { primary: "text-sm font-semibold", loose: "text-[10px] font-medium text-stone-500" },
  md: { primary: "text-base font-bold", loose: "text-xs font-medium text-stone-500" },
  lg: { primary: "text-lg font-bold", loose: "text-sm font-medium text-stone-500" },
} as const;

const ALIGN = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
} as const;

const TONE = {
  neutral: "text-stone-900",
  in: "text-emerald-700",
  out: "text-red-700",
} as const;

export function StockQuantityDisplay({
  quantity,
  stockUnit,
  unitsPerStockUnit,
  baseUnit,
  size = "md",
  align = "left",
  leadingSign = "",
  tone = "neutral",
  className = "",
}: StockQuantityDisplayProps) {
  const unitFields = { stockUnit, unitsPerStockUnit, baseUnit };
  const split = splitBaseQuantity(Math.abs(quantity), unitFields);
  const styles = SIZE[size];
  const toneClass = TONE[tone];
  const sign = leadingSign || "";

  if (!split.usesStockUnit) {
    return (
      <span className={`inline-flex flex-col tabular-nums ${ALIGN[align]} ${className}`}>
        <span className={`${styles.primary} whitespace-nowrap ${toneClass}`}>
          {sign}
          {formatBaseUnits(Math.abs(quantity), unitFields)}
        </span>
      </span>
    );
  }

  const packLabel = pluralizeStockUnit(split.unitLabel, split.fullUnits);

  return (
    <span className={`inline-flex flex-col gap-0.5 tabular-nums ${ALIGN[align]} ${className}`}>
      <span className={`${styles.primary} whitespace-nowrap ${toneClass}`}>
        {sign}
        {split.fullUnits.toLocaleString()} {packLabel}
      </span>
      {split.loose > 0 ? (
        <span className={`${styles.loose} whitespace-nowrap`}>
          + {formatBaseUnits(split.loose, unitFields)}
        </span>
      ) : null}
    </span>
  );
}
