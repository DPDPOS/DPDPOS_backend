import { logger } from "../../infrastructure/logging/logger.js";

export function registerEvidenceExpirationScheduler(): void {
  logger.debug("scheduler.evidence_expiration.deferred");
}
