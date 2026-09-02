import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import { roadmapService } from "../../../framework/services/roadmap.service.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";
import { logger } from "../../../../infrastructure/logging/logger.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";

type RemediationCompletedPayload = {
  taskId?: string;
  remediationTaskId?: string;
  violationId?: string;
};

export const onRemediationCompletedRoadmap: DomainEventHandler = async (
  event,
) => {
  if (event.eventType !== DOMAIN_EVENTS.RemediationCompleted) return;

  const payload = event.payload as RemediationCompletedPayload;
  const taskId = payload.taskId ?? payload.remediationTaskId;

  const task = taskId
    ? await prisma.remediationTask.findFirst({
        where: {
          id: taskId,
          organizationId: event.organizationId,
          deletedAt: null,
        },
        select: { controlId: true, violationId: true },
      })
    : null;

  let controlId = task?.controlId ?? null;
  if (!controlId && (payload.violationId || task?.violationId)) {
    const violation = await prisma.violation.findFirst({
      where: {
        id: payload.violationId ?? task!.violationId,
        organizationId: event.organizationId,
      },
      select: { controlId: true },
    });
    controlId = violation?.controlId ?? null;
  }

  if (!controlId) return;

  const control = await prisma.control.findFirst({
    where: {
      id: controlId,
      organizationId: event.organizationId,
      deletedAt: null,
    },
    select: { frameworkId: true },
  });

  if (!control) return;

  const ctx: RequestContext = {
    correlationId: event.correlationId ?? `roadmap:${event.eventId}`,
    organizationId: event.organizationId,
    actorUserId: event.actorUserId ?? SYSTEM_ACTOR_ID,
    permissions: [],
    roles: [],
  };

  try {
    await roadmapService.syncSnapshot(
      ctx.organizationId,
      control.frameworkId,
      ctx.actorUserId,
    );
  } catch (err) {
    logger.warn(
      { err, controlId },
      "roadmap.sync_on_remediation_complete_failed",
    );
  }
};
