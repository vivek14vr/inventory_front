import { NotificationsContent } from "@/components/notifications/NotificationsContent";
import { AUTH_ROUTES } from "@/lib/auth/constants";

export default function AppNotificationsPage() {
  return (
    <NotificationsContent checklistsHref={AUTH_ROUTES.appChecklists} />
  );
}
