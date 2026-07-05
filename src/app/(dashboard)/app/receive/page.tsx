import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AppReceiveRedirectPage() {
  redirect(AUTH_ROUTES.appTransfer);
}
