import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const OrganizationOnboardedEventType = DOMAIN_EVENTS.OrganizationOnboarded;

export type OrganizationOnboardedPayload = {
  organizationId: string;
  completedAt: string;
  answeredCount: number;
};

export type OrganizationOnboardedEvent =
  BaseDomainEvent<OrganizationOnboardedPayload>;
