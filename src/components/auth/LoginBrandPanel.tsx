import { BrandLogo } from "./BrandLogo";

const FEATURES = [
  {
    label: "Vasai",
    title: "Warehouse",
    desc: "Add, sell & send stock",
  },
  {
    label: "Goregaon",
    title: "Warehouse",
    desc: "Receive & check stock",
  },
  {
    label: "Admin",
    title: "Full control",
    desc: "Reports & settings",
  },
] as const;

export function LoginBrandPanel() {
  return (
    <div className="relative flex h-full min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 px-10 py-14 text-white xl:px-14">
      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <BrandLogo size="lg" variant="light" />
        <p className="mt-10 text-sm font-bold uppercase tracking-[0.2em] text-orange-100">
          SV Enterprises
        </p>
        <h1 className="mt-4 max-w-md text-[2rem] font-bold leading-[1.15] tracking-tight xl:text-4xl">
          Easy stock management
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-orange-50/90">
          Simple buttons. Big text. No confusion. Manage your warehouse stock
          the easy way.
        </p>
      </div>

      <div className="relative space-y-3">
        {FEATURES.map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-4 rounded-2xl border-2 border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm"
          >
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold">
              {item.label.slice(0, 1)}
            </span>
            <div>
              <p className="text-base font-bold text-white">
                {item.label} — {item.title}
              </p>
              <p className="mt-0.5 text-sm text-orange-100/80">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="relative text-sm text-orange-100/60">
        © {new Date().getFullYear()} SV Enterprises. Authorized access only.
      </p>
    </div>
  );
}
