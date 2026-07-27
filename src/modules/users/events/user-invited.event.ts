import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const UserInvitedEventType = DOMAIN_EVENTS.UserInvited;

export type UserInvitedPayload = {
  userId: string;
  email: string;
  invitedBy?: string;
};

export type UserInvitedEvent = BaseDomainEvent<UserInvitedPayload>;
