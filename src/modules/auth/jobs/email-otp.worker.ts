import { Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { sendEmailOtp } from "../../../infrastructure/email/email-otp.sender.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import type { EmailOtpJob } from "../../../jobs/queues/email-otp.queue.js";

let worker: Worker<EmailOtpJob> | null = null;

export function startEmailOtpWorker(): void {
  if (worker) return;
  worker = new Worker<EmailOtpJob>(
    QUEUE_NAMES.EMAIL_OTP,
    async (job) => {
      if (job.data.expiresAt <= Date.now()) {
        logger.warn({ jobId: job.id }, "email_otp.job_expired");
        return;
      }
      await sendEmailOtp({
        email: job.data.email,
        code: job.data.code,
        expiresInSeconds: Math.max(1, Math.floor((job.data.expiresAt - Date.now()) / 1000)),
      });
    },
    { connection: createBullMqConnectionOptions(), concurrency: 5 },
  );
  worker.on("completed", (job) => logger.debug({ jobId: job.id }, "email_otp.job_completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "email_otp.job_failed"));
  logger.info("email_otp.worker_started");
}

export function stopEmailOtpWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const current = worker;
  worker = null;
  return current.close();
}
