import { logger } from "../infrastructure/logging/logger.js";
import { registerEventHandler } from "../events/handler-registry.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { onValidationFailed } from "../modules/violations/events/handlers/validation-failed.handler.js";
import { onAuditableEvent } from "../modules/audit/index.js";
import {
  onViolationCreatedNotify,
  onViolationClosedNotify,
  onRemediationTaskAssignedNotify,
  onRemediationCompletedNotify,
  onEvidenceApprovedNotify,
  onRightsRequestNotify,
  onDpaExpiringNotify,
  onValidationFailedNotify,
  onReportGeneratedNotify,
} from "../modules/notifications/index.js";
import { onViolationCreated } from "../modules/remediation/events/handlers/violation-created.handler.js";
import { onControlUpdatedRoadmap } from "../modules/framework/events/handlers/control-updated-roadmap.handler.js";
import { onFrameworkPublishedRoadmap } from "../modules/framework/events/handlers/framework-published.handler.js";
import { onEvidenceApprovedControlProgress } from "../modules/controls/events/handlers/evidence-approved-control.handler.js";
import { onRemediationCompletedRoadmap } from "../modules/remediation/events/handlers/remediation-completed.handler.js";
import { onRemediationCompletedAdvanceViolation } from "../modules/violations/events/handlers/remediation-completed.handler.js";
import { onViolationClosedCascade } from "../modules/violations/events/handlers/violation-closed.handler.js";
import { onLedgerEvent } from "../modules/ledger/index.js";

/**
 * Event subscriber registration — consumers register handlers here at boot.
 * Producers never import consumer handlers.
 */
export function registerEventSubscribers(): void {
  registerEventHandler(DOMAIN_EVENTS.ValidationFailed, onValidationFailed);

  for (const eventType of Object.values(DOMAIN_EVENTS)) {
    registerEventHandler(eventType, onAuditableEvent);
  }

  registerEventHandler(DOMAIN_EVENTS.ViolationCreated, onViolationCreatedNotify);
  registerEventHandler(DOMAIN_EVENTS.ViolationClosed, onViolationClosedNotify);
  registerEventHandler(
    DOMAIN_EVENTS.RemediationTaskAssigned,
    onRemediationTaskAssignedNotify,
  );
  registerEventHandler(
    DOMAIN_EVENTS.RemediationCompleted,
    onRemediationCompletedNotify,
  );
  registerEventHandler(DOMAIN_EVENTS.EvidenceApproved, onEvidenceApprovedNotify);
  registerEventHandler(
    DOMAIN_EVENTS.RightsRequestSubmitted,
    onRightsRequestNotify,
  );
  registerEventHandler(DOMAIN_EVENTS.DpaExpiring, onDpaExpiringNotify);
  registerEventHandler(DOMAIN_EVENTS.ValidationFailed, onValidationFailedNotify);
  registerEventHandler(DOMAIN_EVENTS.ReportGenerated, onReportGeneratedNotify);

  registerEventHandler(DOMAIN_EVENTS.ViolationCreated, onViolationCreated);
  registerEventHandler(DOMAIN_EVENTS.ViolationClosed, onViolationClosedCascade);

  registerEventHandler(DOMAIN_EVENTS.ControlUpdated, onControlUpdatedRoadmap);
  registerEventHandler(
    DOMAIN_EVENTS.FrameworkPublished,
    onFrameworkPublishedRoadmap,
  );
  registerEventHandler(
    DOMAIN_EVENTS.EvidenceApproved,
    onEvidenceApprovedControlProgress,
  );
  registerEventHandler(
    DOMAIN_EVENTS.RemediationCompleted,
    onRemediationCompletedRoadmap,
  );
  registerEventHandler(
    DOMAIN_EVENTS.RemediationCompleted,
    onRemediationCompletedAdvanceViolation,
  );

  for (const eventType of [
    DOMAIN_EVENTS.ConsentWithdrawn,
    DOMAIN_EVENTS.ErasureCompleted,
    DOMAIN_EVENTS.AgentEnrolled,
    DOMAIN_EVENTS.CatalogRevisionCreated,
    DOMAIN_EVENTS.ViolationCreated,
    DOMAIN_EVENTS.DsrTaskEscalated,
  ]) {
    registerEventHandler(eventType, onLedgerEvent);
  }

  logger.info("events.subscribers.ready");
}
