import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

export const ViolationCreatedEventType = DOMAIN_EVENTS.ViolationCreated;

export type ViolationCreatedEventPayload = {
  violationId: string;
  severity: string;
  title: string;
  validationResultId?: string;
  evidenceRequiredFlag: boolean;
};
