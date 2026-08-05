import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";

import { remediationTaskService } from "../../services/remediation-task.service.js";
import type { ViolationCreatedPayload } from "../../services/remediation-task.service.js";

/**
 * Consumes ViolationCreated events from the event bus and auto-creates a
 * PENDING remediation task for the violation. Idempotent — the service dedupes
 * by [organizationId, violationId] for AUTO tasks (partial unique index
 * backstop).
 */
export const onViolationCreated: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.ViolationCreated) return;

  const ctx: RequestContext = {
    correlationId:
      event.correlationId ?? `remediation:${event.eventId}`,
    organizationId: event.organizationId,
    actorUserId: event.actorUserId ?? SYSTEM_ACTOR_ID,
    permissions: [],
    roles: [],
  };

  await remediationTaskService.createFromViolationCreated(
    ctx,
    event.payload as unknown as ViolationCreatedPayload,
  );
};
