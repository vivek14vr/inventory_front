export type AuditLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  source?: "APPLICATION" | "API" | "SYSTEM";
  outcome?: "SUCCESS" | "FAILURE";
  requestId?: string;
  revertedAt?: string;
  revertedBy?: string;
  revertAuditLogId?: string;
  canRevert?: boolean;
  revertReason?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AuditSummary = {
  total: number;
  last7Days: number;
  topActions: { action: string; count: number }[];
};

export type AuditFilters = {
  action?: string;
  entity?: string;
  userId?: string;
  source?: "APPLICATION" | "API" | "SYSTEM";
  outcome?: "SUCCESS" | "FAILURE";
  dateFrom?: string;
  dateTo?: string;
};
