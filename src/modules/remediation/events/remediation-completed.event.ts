import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

export const RemediationCompletedEventType = DOMAIN_EVENTS.RemediationCompleted;

export type RemediationCompletedEventPayload = {
  taskId: string;
  violationId: string;
  closedAt: string;
  verifiedAt: string;
  verifiedBy?: string;
  resolutionSummary?: string;
};
