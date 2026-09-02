import { logger } from "../../../../infrastructure/logging/logger.js";
import { notificationService } from "../../services/notification.service.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";

export async function onViolationCreatedNotify(event: any) {
  try {
    const payload = event.payload ?? {};
    const violationId = payload.violationId ?? payload.id;
    let assignedTo = payload.assignedTo as string | undefined;
    const title = payload.title || "Unknown";
    const severity = payload.severity || "UNKNOWN";

    if (!assignedTo && violationId) {
      const row = await prisma.violation.findFirst({
        where: { id: violationId, organizationId: event.organizationId },
        select: { assignedTo: true },
      });
      assignedTo = row?.assignedTo ?? undefined;
    }

    if (!assignedTo) {
      const dpo = await prisma.user.findFirst({
        where: {
          organizationId: event.organizationId,
          deletedAt: null,
          status: { not: "DISABLED" },
          userRoles: {
            some: {
              role: { name: { in: ["DPO", "ORG_ADMIN", "COMPLIANCE_OFFICER"] } },
            },
          },
        },
        select: { id: true },
      });
      assignedTo = dpo?.id;
    }

    if (assignedTo && violationId) {
      await notificationService.sendForEvent(
        event,
        assignedTo,
        "VIOLATION_CREATED",
        { title, severity },
        { type: "VIOLATION", id: violationId },
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onViolationCreatedNotify");
  }
}

export async function onViolationClosedNotify(event: any) {
  try {
    const payload = event.payload ?? {};
    const violationId = payload.violationId;
    const title = payload.title || "Violation";
    let recipient = payload.assignedTo as string | undefined;

    if (!recipient && violationId) {
      const row = await prisma.violation.findFirst({
        where: { id: violationId, organizationId: event.organizationId },
        select: { assignedTo: true, createdBy: true },
      });
      recipient = row?.assignedTo ?? row?.createdBy ?? undefined;
    }

    if (recipient && violationId) {
      await notificationService.sendForEvent(
        event,
        recipient,
        "VIOLATION_CLOSED",
        { title },
        { type: "VIOLATION", id: violationId },
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onViolationClosedNotify");
  }
}

export async function onRemediationTaskAssignedNotify(event: any) {
  try {
    const { assignedTo, taskId, violationId } = event.payload ?? {};
    if (!assignedTo || !taskId) return;

    await notificationService.sendForEvent(
      event,
      assignedTo,
      "REMEDIATION_TASK_ASSIGNED",
      {
        title: "Remediation task assigned",
        violationId: violationId || "—",
      },
      { type: "REMEDIATION", id: taskId },
    );
  } catch (err) {
    logger.error(
      { err, event },
      "Failed to process onRemediationTaskAssignedNotify",
    );
  }
}

export async function onRemediationCompletedNotify(event: any) {
  try {
    const payload = event.payload ?? {};
    const taskId = payload.taskId ?? payload.remediationTaskId;
    const violationId = payload.violationId;
    if (!taskId) return;

    const recipients = new Set<string>();
    const task = await prisma.remediationTask.findFirst({
      where: { id: taskId, organizationId: event.organizationId },
      select: { assignedTo: true, createdBy: true },
    });
    if (task?.assignedTo) recipients.add(task.assignedTo);
    if (task?.createdBy) recipients.add(task.createdBy);

    if (violationId) {
      const violation = await prisma.violation.findFirst({
        where: { id: violationId, organizationId: event.organizationId },
        select: { assignedTo: true },
      });
      if (violation?.assignedTo) recipients.add(violation.assignedTo);
    }

    for (const userId of recipients) {
      await notificationService.sendForEvent(
        event,
        userId,
        "REMEDIATION_COMPLETED",
        { title: "Remediation task completed" },
        { type: "REMEDIATION", id: taskId },
      );
    }
  } catch (err) {
    logger.error(
      { err, event },
      "Failed to process onRemediationCompletedNotify",
    );
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
        { type: "EVIDENCE", id: event.payload.id },
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onEvidenceApprovedNotify");
  }
}

export async function onRightsRequestNotify(event: any) {
  try {
    logger.info(
      { event },
      "onRightsRequestNotify: Rights request submitted (DPO notification stub)",
    );
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
        { type: "VALIDATION", id: event.payload.id },
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
        { type: "REPORT", id: event.payload.id },
      );
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to process onReportGeneratedNotify");
  }
}
