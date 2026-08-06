import { logger } from "../../infrastructure/logging/logger.js";
import { validationQueue } from "../queues/validation.queue.js";
import { DAILY_VALIDATION_SWEEP_JOB_NAME } from "../../modules/validations/jobs/validation-run.processor.js";

/** Daily scheduled validation sweep (default 02:00 UTC). */
const DAILY_VALIDATION_CRON = "0 2 * * *";

/**
 * Registers the daily validation sweep as a BullMQ repeatable job at worker
 * boot. The repeatable job itself is consumed by the validation worker, which
 * fans it out into per-organization SCHEDULED runs.
 */
export async function registerDailyValidationScheduler(): Promise<void> {
  await validationQueue.add(
    DAILY_VALIDATION_SWEEP_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_VALIDATION_CRON },
      jobId: DAILY_VALIDATION_SWEEP_JOB_NAME,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
  logger.info(
    { cron: DAILY_VALIDATION_CRON },
    "scheduler.daily_validation.registered",
  );
}
