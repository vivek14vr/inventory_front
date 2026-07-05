import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AdminReceiveRedirectPage() {
  redirect(AUTH_ROUTES.adminTransfer);
}
