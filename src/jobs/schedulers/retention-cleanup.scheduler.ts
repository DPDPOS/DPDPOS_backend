import { logger } from "../../infrastructure/logging/logger.js";

export function registerRetentionCleanupScheduler(): void {
  logger.debug("scheduler.retention_cleanup.deferred");
}
