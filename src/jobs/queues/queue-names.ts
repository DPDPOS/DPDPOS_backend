export const QUEUE_NAMES = {
  VALIDATION: "validation-queue",
  REPORT: "report-queue",
  NOTIFICATION: "notification-queue",
  AI: "ai-queue",
  AUDIT: "audit-queue",
  RETENTION: "retention-queue",
  EXPORT: "export-queue",
  EVENT_RELAY: "event-relay-queue",
  EMAIL_OTP: "email-otp-queue",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
