"use client";

import dynamic from "next/dynamic";
import { LoginFormSkeleton } from "@/components/auth/LoginFormSkeleton";

const LoginForm = dynamic(
  () => import("@/components/auth/LoginForm").then((m) => ({ default: m.LoginForm })),
  { ssr: false, loading: () => <LoginFormSkeleton /> }
);

export function LoginFormClient() {
  return <LoginForm />;
}
