import { logger } from "../../../../infrastructure/logging/logger.js";
import { notificationService } from "../../services/notification.service.js";

export async function onViolationCreatedNotify(event: any) {
  try {
    const { assignedTo, title, severity } = event.payload;
    if (assignedTo) {
      await notificationService.sendForEvent(
        event,
        assignedTo,
        "VIOLATION_CREATED",
        { title: title || "Unknown", severity: severity || "UNKNOWN" },
        { type: "VIOLATION", id: event.payload.id }
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onViolationCreatedNotify");
  }
}

export async function onEvidenceApprovedNotify(event: any) {
  try {
    const { uploadedBy, fileName } = event.payload;
    if (uploadedBy) {
      await notificationService.sendForEvent(
        event,
        uploadedBy,
        "EVIDENCE_APPROVED",
        { fileName: fileName || "Unknown" },
        { type: "EVIDENCE", id: event.payload.id }
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onEvidenceApprovedNotify");
  }
}

export async function onRightsRequestNotify(event: any) {
  try {
    // sends to all DPO users — just log for now
    logger.info({ event }, "onRightsRequestNotify: Rights request submitted (DPO notification stub)");
  } catch (err) {
    logger.error({ err, event }, "Failed to process onRightsRequestNotify");
  }
}

export async function onValidationFailedNotify(event: any) {
  try {
    const { ownerId, failCount } = event.payload;
    if (ownerId) {
      await notificationService.sendForEvent(
        event,
        ownerId,
        "VALIDATION_FAILED",
        { failCount: failCount || 0 },
        { type: "VALIDATION", id: event.payload.id }
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onValidationFailedNotify");
  }
}

export async function onReportGeneratedNotify(event: any) {
  try {
    const { generatedBy, title } = event.payload;
    if (generatedBy) {
      await notificationService.sendForEvent(
        event,
        generatedBy,
        "REPORT_GENERATED",
        { title: title || "Unknown" },
        { type: "REPORT", id: event.payload.id }
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onReportGeneratedNotify");
  }
}
