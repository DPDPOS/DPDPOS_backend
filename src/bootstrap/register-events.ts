import { logger } from "../infrastructure/logging/logger.js";

/**
 * Event subscriber registration — consumers register handlers here at boot.
 * Producers never import consumer handlers.
 */
export function registerEventSubscribers(): void {
  logger.info("events.subscribers.ready");
}
