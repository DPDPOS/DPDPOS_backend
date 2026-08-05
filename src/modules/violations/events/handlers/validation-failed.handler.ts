import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import type { RequestContext } from "../../../../shared/types/request-context.js";

import { violationService } from "../../services/violation.service.js";
import type { ValidationFailedPayload } from "../../services/violation.service.js";

/**
 * Consumes ValidationFailed events from the event bus and opens a Violation.
 * Idempotent — the service dedupes by validationResultId.
 */
export const onValidationFailed: DomainEventHandler = async (event) => {
  if (event.eventType !== DOMAIN_EVENTS.ValidationFailed) return;

  const ctx: RequestContext = {
    correlationId:
      event.correlationId ?? `violation:${event.eventId}`,
    organizationId: event.organizationId,
    actorUserId: event.actorUserId ?? SYSTEM_ACTOR_ID,
    permissions: [],
    roles: [],
  };

  await violationService.createFromValidationFailed(
    ctx,
    event.payload as unknown as ValidationFailedPayload,
  );
};
