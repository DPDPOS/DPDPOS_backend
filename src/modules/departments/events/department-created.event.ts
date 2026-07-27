import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const DepartmentCreatedEventType = DOMAIN_EVENTS.DepartmentCreated;

export type DepartmentCreatedPayload = {
  departmentId: string;
  name: string;
};

export type DepartmentCreatedEvent = BaseDomainEvent<DepartmentCreatedPayload>;
