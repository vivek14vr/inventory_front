import { BrandLogo } from "@/components/auth/BrandLogo";
import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { LoginConfigBanner } from "@/components/auth/LoginConfigBanner";
import { LoginFormClient } from "@/components/auth/LoginFormClient";

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] bg-white">
      <aside className="hidden w-[44%] shrink-0 xl:w-[46%] lg:block">
        <LoginBrandPanel />
      </aside>

      <main className="login-panel relative flex min-h-[100dvh] flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-50/80 via-white to-white"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(228 228 231 / 0.35) 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-1 flex-col px-6 py-8 sm:px-12 lg:px-16 xl:px-20">
          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <BrandLogo size="md" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
                    SV Enterprises
                  </p>
                  <p className="text-sm text-zinc-500">Inventory Management</p>
                </div>
              </div>

              <div className="mb-8 lg:mb-10">
                <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 sm:text-[2rem]">
                  Welcome back
                </h1>
                <p className="mt-2.5 text-base leading-relaxed text-zinc-500 sm:text-[15px]">
                  Sign in with your account to access inventory, stock movement,
                  and reports.
                </p>
              </div>

              <LoginConfigBanner />

              <LoginFormClient />

              <p className="mt-8 text-center text-xs text-zinc-400">
                Secure access for authorized SV Enterprises personnel only.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
