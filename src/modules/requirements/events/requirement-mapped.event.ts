import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const RequirementMappedEventType = DOMAIN_EVENTS.RequirementMapped;

export type RequirementMappedPayload = {
  requirementId: string;
  controlId?: string;
};

export type RequirementMappedEvent = BaseDomainEvent<RequirementMappedPayload>;
