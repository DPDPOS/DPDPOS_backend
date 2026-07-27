import { logger } from "../infrastructure/logging/logger.js";

/**
 * Job processor registry — module-specific processors register here at worker boot.
 * Processors are added as each module lands.
 */
export function registerJobProcessors(): void {
  logger.info("jobs.registry.ready");
}
