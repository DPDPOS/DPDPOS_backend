import { logger } from "../infrastructure/logging/logger.js";

import { startValidationWorker, stopValidationWorker } from "../modules/validations/jobs/validation-run.worker.js";
import { registerDailyValidationScheduler } from "./schedulers/daily-validation.scheduler.js";
import { registerSlaReminderScheduler } from "./schedulers/sla-reminder.scheduler.js";
import {
  registerEvidenceExpirationScheduler,
  stopEvidenceExpirationScheduler,
} from "./schedulers/evidence-expiration.scheduler.js";
import {
  registerDpaExpiryScheduler,
  stopDpaExpiryScheduler,
} from "./schedulers/dpa-expiry.scheduler.js";

// Developer C workers
import { startNotificationWorker, stopNotificationWorker } from "../modules/notifications/jobs/notification.worker.js";
import { startReportWorker, stopReportWorker } from "../modules/reports/jobs/report.worker.js";
import { startAiWorker, stopAiWorker } from "../modules/ai/jobs/ai.worker.js";
import { startEmailOtpWorker, stopEmailOtpWorker } from "../modules/auth/jobs/email-otp.worker.js";

/**
 * Job processor registry — module-specific processors register here at worker
 * boot. The validations module owns the first live queue consumer (validation
 * worker) and the first repeatable job (daily validation sweep); future modules
 * register their own processors alongside these.
 */
export async function registerJobProcessors(): Promise<void> {
  startValidationWorker();
  await registerDailyValidationScheduler();
  await registerSlaReminderScheduler();
  await registerEvidenceExpirationScheduler();
  await registerDpaExpiryScheduler();

  // Developer C job processors
  startNotificationWorker();
  startReportWorker();
  startAiWorker();
  startEmailOtpWorker();

  logger.info("jobs.registry.ready");
}

/** Close all BullMQ workers before the shared Redis connection is disconnected. */
export async function stopJobProcessors(): Promise<void> {
  await Promise.all([
    stopEmailOtpWorker(),
    stopValidationWorker(),
    stopNotificationWorker(),
    stopReportWorker(),
    stopAiWorker(),
    stopEvidenceExpirationScheduler(),
    stopDpaExpiryScheduler(),
  ]);
  logger.info("jobs.registry.stopped");
}
