import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";
import { logger } from "../../../../infrastructure/logging/logger.js";
import { roadmapService } from "../../../framework/services/roadmap.service.js";

type ViolationClosedPayload = {
  violationId: string;
};

/**
 * Closing a violation cancels any remaining non-terminal remediation tasks
 * and refreshes the roadmap atRisk flags.
 */
export const onViolationClosedCascade: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.ViolationClosed) return;

  const payload = event.payload as ViolationClosedPayload;
  if (!payload.violationId) return;

  try {
    const openTasks = await prisma.remediationTask.findMany({
      where: {
        organizationId: event.organizationId,
        violationId: payload.violationId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: { id: true, version: true, controlId: true },
    });

    for (const task of openTasks) {
      await prisma.remediationTask.update({
        where: { id: task.id },
        data: {
          status: "CANCELLED",
          resolutionSummary:
            "Cancelled because parent violation was closed",
          updatedBy: event.actorUserId ?? SYSTEM_ACTOR_ID,
          version: { increment: 1 },
        },
      });
    }

    const violation = await prisma.violation.findFirst({
      where: {
        id: payload.violationId,
        organizationId: event.organizationId,
      },
      select: { controlId: true },
    });

    if (violation?.controlId) {
      const control = await prisma.control.findFirst({
        where: { id: violation.controlId, deletedAt: null },
        select: { frameworkId: true },
      });
      if (control) {
        await roadmapService.syncSnapshot(
          event.organizationId,
          control.frameworkId,
          event.actorUserId ?? SYSTEM_ACTOR_ID,
        );
      }
    }

    logger.info(
      { violationId: payload.violationId, cancelledTasks: openTasks.length },
      "violation.closed_cascade_complete",
    );
  } catch (err) {
    logger.warn(
      { err, violationId: payload.violationId },
      "violation.closed_cascade_failed",
    );
  }
};
