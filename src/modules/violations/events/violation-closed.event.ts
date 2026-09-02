import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

export const ViolationClosedEventType = DOMAIN_EVENTS.ViolationClosed;

export type ViolationClosedEventPayload = {
  violationId: string;
  closedAt: string;
  title?: string;
  assignedTo?: string | null;
  resolutionSummary?: string | null;
};
