import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

export const RemediationTaskAssignedEventType =
  DOMAIN_EVENTS.RemediationTaskAssigned;

export type RemediationTaskAssignedEventPayload = {
  taskId: string;
  violationId: string;
  assignedTo: string;
  dueAt?: string;
  assignedAt: string;
};
