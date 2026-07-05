export function LoginFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="space-y-5">
        <div>
          <div className="h-4 w-24 rounded bg-zinc-200" />
          <div className="mt-2 h-12 w-full rounded-xl bg-zinc-100" />
        </div>
        <div>
          <div className="h-4 w-20 rounded bg-zinc-200" />
          <div className="mt-2 h-12 w-full rounded-xl bg-zinc-100" />
        </div>
      </div>
      <div className="h-12 w-full rounded-xl bg-orange-100" />
    </div>
  );
}
