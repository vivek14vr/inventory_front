import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-orange-600 text-white shadow-sm shadow-orange-900/10 hover:bg-orange-700 focus-visible:ring-orange-500/40",
  secondary:
    "border border-stone-200 bg-white text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-stone-300",
  outline:
    "border border-orange-200 bg-orange-50 text-orange-800 shadow-sm hover:border-orange-300 hover:bg-orange-100 focus-visible:ring-orange-500/30",
  ghost:
    "border border-transparent text-stone-600 hover:border-stone-200 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-stone-300",
  danger:
    "border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700 hover:border-red-700 focus-visible:ring-red-500/40",
};

const sizes: Record<ButtonSize, string> = {
  sm: "rounded-lg px-3 py-1.5 text-sm font-semibold min-h-9",
  md: "rounded-xl px-5 py-2.5 text-sm font-semibold min-h-11",
  lg: "rounded-xl px-6 py-3.5 text-base font-semibold min-h-13",
  xl: "rounded-2xl px-8 py-4 text-lg font-bold min-h-14",
};

const base =
  "inline-flex items-center justify-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      )}
      {children}
    </button>
  );
}

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  className?: string;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  children,
  className = "",
}: ButtonLinkProps) {
  return (
    <Link href={href} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
