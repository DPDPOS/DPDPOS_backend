import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";

export const UserLoggedInEventType = DOMAIN_EVENTS.UserLoggedIn;

export type UserLoggedInPayload = {
  userId: string;
  email: string;
  sessionId?: string;
  authSource?: string;
};

export type UserLoggedInEvent = BaseDomainEvent<UserLoggedInPayload>;
