import { logger } from "../infrastructure/logging/logger.js";

import { startValidationWorker } from "../modules/validations/jobs/validation-run.worker.js";
import { registerDailyValidationScheduler } from "./schedulers/daily-validation.scheduler.js";

/**
 * Job processor registry — module-specific processors register here at worker
 * boot. The validations module owns the first live queue consumer (validation
 * worker) and the first repeatable job (daily validation sweep); future modules
 * register their own processors alongside these.
 */
export async function registerJobProcessors(): Promise<void> {
  startValidationWorker();
  await registerDailyValidationScheduler();
  logger.info("jobs.registry.ready");
}
