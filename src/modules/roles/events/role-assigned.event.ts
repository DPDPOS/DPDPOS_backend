import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const RoleAssignedEventType = DOMAIN_EVENTS.RoleAssigned;

export type RoleAssignedPayload = {
  roleId: string;
  userId: string;
  assignedBy?: string;
};

export type RoleAssignedEvent = BaseDomainEvent<RoleAssignedPayload>;
