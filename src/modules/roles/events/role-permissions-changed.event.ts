import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const RolePermissionsChangedEventType = DOMAIN_EVENTS.RolePermissionsChanged;

export type RolePermissionsChangedPayload = {
  roleId: string;
  permissions: string[];
};

export type RolePermissionsChangedEvent = BaseDomainEvent<RolePermissionsChangedPayload>;
