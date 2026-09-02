import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";
import { roadmapService } from "../../services/roadmap.service.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";
import { logger } from "../../../../infrastructure/logging/logger.js";
import { requirementService } from "../../../requirements/services/requirement.service.js";
import type { ControlStatus } from "@prisma/client";

type ControlUpdatedPayload = {
  controlId: string;
  status?: ControlStatus;
  ownerUserId?: string;
  code?: string;
};

export const onControlUpdatedRoadmap: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.ControlUpdated) return;

  const payload = event.payload as ControlUpdatedPayload;
  if (!payload.controlId) return;

  const control = await prisma.control.findFirst({
    where: {
      id: payload.controlId,
      organizationId: event.organizationId,
      deletedAt: null,
    },
    select: { frameworkId: true, status: true },
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
    if (payload.status) {
      await requirementService.syncStatusFromControl(
        ctx,
        payload.controlId,
        payload.status,
      );
    }

    await roadmapService.syncSnapshot(
      ctx.organizationId,
      control.frameworkId,
      ctx.actorUserId,
    );
  } catch (err) {
    logger.warn({ err, controlId: payload.controlId }, "roadmap.sync_on_control_update_failed");
  }
};
