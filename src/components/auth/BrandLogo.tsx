type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
};

const sizes = {
  sm: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5",
  md: "h-12 w-12 rounded-xl [&_svg]:h-6 [&_svg]:w-6",
  lg: "h-16 w-16 rounded-2xl [&_svg]:h-8 [&_svg]:w-8",
};

export function BrandLogo({ size = "md", variant = "dark" }: BrandLogoProps) {
  const isLight = variant === "light";
  return (
    <div
      className={`flex shrink-0 items-center justify-center shadow-sm ${sizes[size]} ${
        isLight
          ? "bg-white/20 text-white ring-2 ring-white/30 backdrop-blur-sm"
          : "bg-orange-600 text-white shadow-orange-900/20"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    </div>
  );
}
