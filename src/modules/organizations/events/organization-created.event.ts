import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const OrganizationCreatedEventType = DOMAIN_EVENTS.OrganizationCreated;

export type OrganizationCreatedPayload = {
  organizationId: string;
  name: string;
};

export type OrganizationCreatedEvent = BaseDomainEvent<OrganizationCreatedPayload>;
