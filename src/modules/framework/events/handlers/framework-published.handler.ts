import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";
import { roadmapService } from "../../services/roadmap.service.js";
import { logger } from "../../../../infrastructure/logging/logger.js";

type FrameworkPublishedPayload = {
  frameworkId: string;
  name: string;
};

export const onFrameworkPublishedRoadmap: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.FrameworkPublished) return;

  const payload = event.payload as FrameworkPublishedPayload;
  if (!payload.frameworkId) return;

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
      payload.frameworkId,
      ctx.actorUserId,
    );
  } catch (err) {
    logger.warn({ err, frameworkId: payload.frameworkId }, "roadmap.sync_on_publish_failed");
  }
};
