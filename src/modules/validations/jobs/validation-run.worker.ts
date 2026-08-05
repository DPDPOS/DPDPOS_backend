import { Worker } from "bullmq";

import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import { logger } from "../../../infrastructure/logging/logger.js";

import {
  processValidationRunJob,
  processDailyValidationSweep,
  DAILY_VALIDATION_SWEEP_JOB_NAME,
  type ValidationRunJobData,
} from "./validation-run.processor.js";

let worker: Worker | null = null;

type ValidationJobData = ValidationRunJobData | Record<string, never>;

/** Starts the validation-queue consumer in the worker process. */
export function startValidationWorker(): void {
  if (worker) return;

  worker = new Worker<ValidationJobData>(
    QUEUE_NAMES.VALIDATION,
    async (job) => {
      if (job.name === DAILY_VALIDATION_SWEEP_JOB_NAME) {
        return processDailyValidationSweep();
      }
      return processValidationRunJob(job.data as ValidationRunJobData);
    },
    {
      connection: createBullMqConnectionOptions(),
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, jobName: job.name }, "validation.job_worker_completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, "validation.job_worker_failed");
  });

  logger.info("validation.worker_started");
}

export function stopValidationWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker;
  worker = null;
  return w.close();
}
