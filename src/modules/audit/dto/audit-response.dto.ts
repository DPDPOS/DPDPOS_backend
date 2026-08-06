export interface AuditLogRecord {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  beforeJson: any | null;
  afterJson: any | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: Date;
}
