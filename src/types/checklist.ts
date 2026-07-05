export type ChecklistTask = {
  id: string;
  title: string;
  sortOrder: number;
  dueTime?: string;
  completed?: boolean;
  completedAt?: string;
  isPastDue?: boolean;
  completedLate?: boolean;
};

export type Checklist = {
  id: string;
  title: string;
  description?: string;
  assignedUserIds: string[];
  tasks: ChecklistTask[];
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodayChecklist = Checklist & {
  date: string;
  isPastDue?: boolean;
  completedCount: number;
  totalCount: number;
};

export type ChecklistProgressTask = {
  title: string;
  dueTime?: string;
  isPastDue?: boolean;
  completedAt?: string;
  completedLate?: boolean;
};

export type ChecklistProgressUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  warehouse?: { name: string; code: string };
  tasks: ChecklistTask[];
  pendingTasks: ChecklistProgressTask[];
  completedTasks: ChecklistProgressTask[];
  completedCount: number;
  totalCount: number;
  status: "completed" | "pending" | "overdue";
};

export type ChecklistProgress = {
  checklist: Checklist;
  date: string;
  isPastDue?: boolean;
  users: ChecklistProgressUser[];
};
