import { logger } from "../infrastructure/logging/logger.js";
import { QUEUE_NAMES } from "../jobs/queues/queue-names.js";

export function registerQueues(): void {
  logger.info({ queues: Object.values(QUEUE_NAMES) }, "queues.registered");
}
