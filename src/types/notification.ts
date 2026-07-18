export type NotificationType =
  | "CHECKLIST_PENDING"
  | "CHECKLIST_REMINDER"
  | "ADMIN_REMINDER";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  checklistId: string;
  taskId: string;
  checklistTitle: string;
  taskTitle: string;
  date: string;
  reminderKey: string;
  dueTime?: string;
  read: boolean;
  readAt?: string;
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
  isPastDue?: boolean;
};

export type NotificationSyncResult = {
  created: number;
  notifications: AppNotification[];
};

export type NotificationPollResult = {
  sync: NotificationSyncResult;
  items: AppNotification[];
  unreadCount: number;
};
