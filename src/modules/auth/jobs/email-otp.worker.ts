import { type Job, UnrecoverableError, Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { getEmailProvider } from "../../../infrastructure/email/ses-email.provider.js";
import { classifyEmailDeliveryError } from "../../../infrastructure/email/email-delivery-error.js";
import { getRedis } from "../../../infrastructure/cache/redis-client.js";
import { appConfig } from "../../../config/app.config.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import type { EmailOtpJob } from "../../../jobs/queues/email-otp.queue.js";
import type { EmailProvider } from "../../../infrastructure/email/email.provider.js";

let worker: Worker<EmailOtpJob> | null = null;

export const EMAIL_OTP_WORKER_LIMITER = {
  max: appConfig.email.rateLimitMax,
  duration: appConfig.email.rateLimitDurationMs,
};

type DeliveryStateStore = Pick<ReturnType<typeof getRedis>, "get" | "set">;

export async function processEmailOtpJob(
  job: Pick<Job<EmailOtpJob>, "id" | "data">,
  dependencies: { provider?: EmailProvider; redis?: DeliveryStateStore } = {},
): Promise<void> {
  const startedAt = Date.now();
  const { challengeId, userId, email, code, expiresAt } = job.data;
  if (!challengeId || !userId || !email || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
    throw new UnrecoverableError("Invalid critical email job payload");
  }
  if (expiresAt <= Date.now()) {
    logger.warn({ challengeId, userId }, "mfa.email_delivery_expired");
    return;
  }
  const redis = dependencies.redis ?? getRedis();
  const deliveryKey = `auth:mfa:delivery:${job.id}`;
  if (await redis.get(deliveryKey) === "SENT") {
    logger.info({ jobId: job.id, challengeId, userId }, "mfa.email_delivery_duplicate_suppressed");
    return;
  }
  try {
    const result = await (dependencies.provider ?? getEmailProvider()).sendMfaOtp({
      recipient: email,
      code,
      expiresInSeconds: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
    });
    // Best effort only: SMTP cannot give strict exactly-once delivery if its response is lost.
    await redis.set(deliveryKey, "SENT", "EX", 600);
    logger.info({ jobId: job.id, challengeId, userId, provider: appConfig.email.provider, messageId: result.messageId, durationMs: Date.now() - startedAt }, "mfa.email_delivery_sent");
  } catch (error) {
    throw classifyEmailDeliveryError(error);
  }
}

export function startEmailOtpWorker(): void {
  if (worker) return;
  worker = new Worker<EmailOtpJob>(
    QUEUE_NAMES.EMAIL_CRITICAL,
    async (job) => processEmailOtpJob(job),
    {
      connection: createBullMqConnectionOptions(),
      concurrency: appConfig.email.workerConcurrency,
      limiter: EMAIL_OTP_WORKER_LIMITER,
    },
  );
  worker.on("active", (job) => logger.info({ jobId: job.id, challengeId: job.data.challengeId, userId: job.data.userId, attempt: job.attemptsMade + 1 }, "mfa.email_delivery_started"));
  worker.on("completed", (job) => logger.debug({ challengeId: job.data.challengeId, userId: job.data.userId }, "mfa.email_delivery_completed"));
  worker.on("failed", (job, err) => {
    const metadata = { jobId: job?.id, challengeId: job?.data.challengeId, userId: job?.data.userId, attempt: job?.attemptsMade, errorName: err.name, errorCode: (err as { code?: string }).code };
    if (err instanceof UnrecoverableError) logger.error(metadata, "mfa.email_delivery_unrecoverable");
    else if ((job?.attemptsMade ?? 0) < (job?.opts.attempts ?? 1)) logger.warn(metadata, "mfa.email_delivery_retry");
    else logger.error(metadata, "mfa.email_delivery_failed");
  });
  logger.info({ queue: QUEUE_NAMES.EMAIL_CRITICAL, concurrency: appConfig.email.workerConcurrency, rateLimitMax: appConfig.email.rateLimitMax, rateLimitDurationMs: appConfig.email.rateLimitDurationMs }, "mfa.email_worker_started");
}

export function stopEmailOtpWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const current = worker;
  worker = null;
  return current.close();
}
