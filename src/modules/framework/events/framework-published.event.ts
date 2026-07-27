import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const FrameworkPublishedEventType = DOMAIN_EVENTS.FrameworkPublished;

export type FrameworkPublishedPayload = {
  frameworkId: string;
  name: string;
};

export type FrameworkPublishedEvent = BaseDomainEvent<FrameworkPublishedPayload>;
