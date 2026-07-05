import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/auth/constants";

/** Root URL always goes to login (or middleware sends authenticated users to their dashboard). */
export default function HomePage() {
  redirect(AUTH_ROUTES.login);
}
