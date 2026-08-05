import { logger } from "../infrastructure/logging/logger.js";
import { registerEventHandler } from "../events/handler-registry.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { onValidationFailed } from "../modules/violations/events/handlers/validation-failed.handler.js";

/**
 * Event subscriber registration — consumers register handlers here at boot.
 * Producers never import consumer handlers.
 */
export function registerEventSubscribers(): void {
  registerEventHandler(DOMAIN_EVENTS.ValidationFailed, onValidationFailed);
  logger.info("events.subscribers.ready");
}
