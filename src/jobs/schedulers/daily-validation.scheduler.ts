import { logger } from "../../infrastructure/logging/logger.js";

/** Schedulers register BullMQ repeatable jobs at worker boot — implemented with validations module. */
export function registerDailyValidationScheduler(): void {
  logger.debug("scheduler.daily_validation.deferred");
}
