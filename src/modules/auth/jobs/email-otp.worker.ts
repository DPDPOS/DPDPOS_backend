import { UnrecoverableError, Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { getEmailProvider } from "../../../infrastructure/email/ses-email.provider.js";
import { appConfig } from "../../../config/app.config.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import type { EmailOtpJob } from "../../../jobs/queues/email-otp.queue.js";

let worker: Worker<EmailOtpJob> | null = null;

export function startEmailOtpWorker(): void {
  if (worker) return;
  worker = new Worker<EmailOtpJob>(
    QUEUE_NAMES.EMAIL_CRITICAL,
    async (job) => {
      const { challengeId, userId, email, code, expiresAt } = job.data;
      if (!challengeId || !userId || !email || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
        throw new UnrecoverableError("Invalid critical email job payload");
      }
      if (expiresAt <= Date.now()) {
        logger.warn({ challengeId, userId }, "mfa.email_delivery_expired");
        return;
      }
      const result = await getEmailProvider().sendMfaOtp({
        recipient: email,
        code,
        expiresInSeconds: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
      });
      logger.info({ challengeId, userId, provider: appConfig.email.provider, messageId: result.messageId }, "mfa.email_delivery_sent");
    },
    { connection: createBullMqConnectionOptions(), concurrency: appConfig.email.workerConcurrency },
  );
  worker.on("completed", (job) => logger.debug({ challengeId: job.data.challengeId, userId: job.data.userId }, "mfa.email_delivery_completed"));
  worker.on("failed", (job, err) => logger.error({ challengeId: job?.data.challengeId, userId: job?.data.userId, err: err.message }, "mfa.email_delivery_failed"));
  logger.info({ queue: QUEUE_NAMES.EMAIL_CRITICAL, concurrency: appConfig.email.workerConcurrency }, "mfa.email_worker_started");
}

export function stopEmailOtpWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const current = worker;
  worker = null;
  return current.close();
}
