export function Alert({ message, type = "error" }: { message: string; type?: "error" | "success" }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${
        type === "error"
          ? "border-red-100 bg-red-50 text-red-800"
          : "border-orange-100 bg-orange-50 text-orange-800"
      }`}
    >
      {type === "error" ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden>
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 0010 7zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      ) : null}
      <span>{message}</span>
    </div>
  );
}
