import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";
import { writeOutboxEvent } from "../../../../events/outbox/outbox.repository.js";
import { withTransaction } from "../../../../infrastructure/database/transaction-manager.js";
import { roadmapService } from "../../../framework/services/roadmap.service.js";
import { logger } from "../../../../infrastructure/logging/logger.js";

type EvidenceApprovedPayload = {
  id: string;
  controlId?: string;
};

export const onEvidenceApprovedControlProgress: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.EvidenceApproved) return;

  const payload = event.payload as EvidenceApprovedPayload;
  if (!payload.controlId) return;

  const control = await prisma.control.findFirst({
    where: {
      id: payload.controlId,
      organizationId: event.organizationId,
      deletedAt: null,
    },
  });

  if (!control || control.status !== "NOT_STARTED") return;

  const ctx: RequestContext = {
    correlationId: event.correlationId ?? `control:${event.eventId}`,
    organizationId: event.organizationId,
    actorUserId: event.actorUserId ?? SYSTEM_ACTOR_ID,
    permissions: [],
    roles: [],
  };

  try {
    await withTransaction(async (tx) => {
      await tx.control.update({
        where: { id: control.id },
        data: {
          status: "IN_PROGRESS",
          updatedBy: ctx.actorUserId,
        },
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ControlUpdated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          controlId: control.id,
          status: "IN_PROGRESS",
          code: control.code,
        },
      });
    });

    await roadmapService.syncSnapshot(
      ctx.organizationId,
      control.frameworkId,
      ctx.actorUserId,
    );
  } catch (err) {
    logger.warn({ err, controlId: payload.controlId }, "control.evidence_progress_failed");
  }
};
