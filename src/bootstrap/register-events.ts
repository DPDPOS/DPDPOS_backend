import { logger } from "../infrastructure/logging/logger.js";
import { registerEventHandler } from "../events/handler-registry.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { onValidationFailed } from "../modules/violations/events/handlers/validation-failed.handler.js";
import { onAuditableEvent } from "../modules/audit/index.js";
import {
  onViolationCreatedNotify,
  onEvidenceApprovedNotify,
  onRightsRequestNotify,
  onValidationFailedNotify,
  onReportGeneratedNotify,
} from "../modules/notifications/index.js";
import { onViolationCreated } from "../modules/remediation/events/handlers/violation-created.handler.js";

/**
 * Event subscriber registration — consumers register handlers here at boot.
 * Producers never import consumer handlers.
 */
export function registerEventSubscribers(): void {
  // Developer B — violation auto-creation on validation failure
  registerEventHandler(DOMAIN_EVENTS.ValidationFailed, onValidationFailed);

  // Developer C — audit logging for all domain events
  // Register the audit handler alongside other subscribers for every event type.
  for (const eventType of Object.values(DOMAIN_EVENTS)) {
    registerEventHandler(eventType, onAuditableEvent);
  }

  // Developer C — notification handlers for key business events
  registerEventHandler(DOMAIN_EVENTS.ViolationCreated, onViolationCreatedNotify);
  registerEventHandler(DOMAIN_EVENTS.EvidenceApproved, onEvidenceApprovedNotify);
  registerEventHandler(DOMAIN_EVENTS.RightsRequestSubmitted, onRightsRequestNotify);
  registerEventHandler(DOMAIN_EVENTS.ValidationFailed, onValidationFailedNotify);
  registerEventHandler(DOMAIN_EVENTS.ReportGenerated, onReportGeneratedNotify);

  // Developer B — remediation auto-task on violation creation
  registerEventHandler(DOMAIN_EVENTS.ViolationCreated, onViolationCreated);

  logger.info("events.subscribers.ready");
}
