export type NotificationRecord = {
  id: string;
  organizationId: string;
  recipientUserId: string;
  notificationType: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  sentAt: Date | null;
  readAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
};
