export { createNotificationRouter } from "./routes/notification.routes.js";
export { NotificationService, notificationService } from "./services/notification.service.js";
export {
  onViolationCreatedNotify,
  onViolationClosedNotify,
  onRemediationTaskAssignedNotify,
  onRemediationCompletedNotify,
  onEvidenceApprovedNotify,
  onRightsRequestNotify,
  onDpaExpiringNotify,
  onValidationFailedNotify,
  onReportGeneratedNotify
} from "./events/handlers/notification-event.handler.js";
export { startNotificationWorker, stopNotificationWorker } from "./jobs/notification.worker.js";
