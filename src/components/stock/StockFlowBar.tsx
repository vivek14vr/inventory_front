type StockFlowBarProps = {
  steps: Array<{ label: string; value?: string }>;
};

export function StockFlowBackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 items-center gap-2 rounded-2xl border-2 border-stone-200 bg-white px-5 text-base font-bold text-stone-600 transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M11.78 4.22a.75.75 0 010 1.06L7.56 9.5h8.19a.75.75 0 010 1.5H7.56l4.22 4.22a.75.75 0 11-1.06 1.06l-5.5-5.5a.75.75 0 010-1.06l5.5-5.5a.75.75 0 011.06 0z"
          clipRule="evenodd"
        />
      </svg>
      Back
    </button>
  );
}

export function StockFlowBar({ steps }: StockFlowBarProps) {
  const activeSteps = steps.filter((s) => s.value);
  if (activeSteps.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3">
      {activeSteps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          {i > 0 && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-orange-300" aria-hidden>
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-stone-800 shadow-sm">
            <span className="text-orange-600">{step.label}:</span> {step.value}
          </span>
        </div>
      ))}
    </div>
  );
}
