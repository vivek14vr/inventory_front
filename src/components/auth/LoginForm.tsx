"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api/client";

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-zinc-400">
      {children}
    </span>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
      <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
        <path
          fillRule="evenodd"
          d="M0.983 10.012C2.45 5.338 6.008 2.5 10 2.5s7.55 2.838 9.017 7.512a1 1 0 01-1.966.392C15.83 8.09 13.19 5.5 10 5.5 6.81 5.5 4.17 8.09 2.949 10.904a1 1 0 01-1.966-.392z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.135-1.135C17.3 14.13 18.55 12.21 19.017 10.012a1 1 0 00-1.966-.392C16.83 11.09 14.19 13.5 10 13.5c-1.12 0-2.166-.27-3.1-.75l-1.62-1.62zM6.1 8.35A4.5 4.5 0 0110 5.5c.92 0 1.78.28 2.49.75l-1.15 1.15A3 3 0 0010 8.5c-.55 0-1.07-.15-1.52-.41L6.1 8.35z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const inputClass =
  "login-input relative z-[1] w-full rounded-xl border border-zinc-200/90 bg-white py-3.5 pl-12 pr-14 text-base text-zinc-900 shadow-sm shadow-zinc-900/[0.03] placeholder:text-zinc-400";

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jsReady, setJsReady] = useState(false);
  const [jsTimeout, setJsTimeout] = useState(false);

  useEffect(() => {
    setJsReady(true);
    const timer = window.setTimeout(() => setJsTimeout(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleLogin = useCallback(async () => {
    if (submitting) return;

    setError("");
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    if (!trimmedEmail || !trimmedPassword) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedEmail, trimmedPassword);
    } catch (err) {
      let message = "Login failed. Please try again.";
      if (err instanceof ApiError) {
        message = err.message;
        if (err.code === "NETWORK_ERROR") {
          message +=
            " Ensure the dev server is running and you opened this app using your computer's IP (e.g. http://192.168.1.10:3000), not localhost.";
        }
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setError(message);
      setSubmitting(false);
    }
  }, [email, password, login, submitting]);

  if (!jsReady) {
    return (
      <div className="space-y-6 animate-pulse" aria-hidden>
        <div className="h-12 rounded-xl bg-zinc-100" />
        <div className="h-12 rounded-xl bg-zinc-100" />
        <div className="h-12 rounded-xl bg-orange-100" />
      </div>
    );
  }

  return (
    <form
      className="relative z-10 space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void handleLogin();
      }}
    >
      {jsTimeout && !error && (
        <p className="text-center text-xs text-zinc-500">
          If buttons do not respond, restart the dev server after pulling the latest
          changes (mobile needs LAN access to JavaScript bundles).
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/90 px-4 py-3.5 text-sm text-red-800"
        >
          <span className="mt-0.5 shrink-0 text-red-500" aria-hidden>
            !
          </span>
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="email" className="login-label">
            Email address
          </label>
          <div className="relative mt-2">
            <FieldIcon>
              <MailIcon />
            </FieldIcon>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username email"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className={inputClass}
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="login-label">
            Password
          </label>
          <div className="relative mt-2">
            <FieldIcon>
              <LockIcon />
            </FieldIcon>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className={inputClass}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPassword((v) => !v);
              }}
              className="absolute right-1 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-lg text-zinc-500 active:bg-zinc-100"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="login-submit relative z-10 flex min-h-[3rem] w-full cursor-pointer touch-manipulation items-center justify-center gap-2.5 rounded-xl bg-orange-700 px-4 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
