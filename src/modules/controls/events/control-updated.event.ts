import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const ControlUpdatedEventType = DOMAIN_EVENTS.ControlUpdated;

export type ControlUpdatedPayload = {
  controlId: string;
  status?: string;
};

export type ControlUpdatedEvent = BaseDomainEvent<ControlUpdatedPayload>;
