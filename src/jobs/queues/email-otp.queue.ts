import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";
import { captureMfaOtpForTest } from "../../infrastructure/email/ses-email.provider.js";

export type EmailOtpJob = {
  challengeId: string;
  userId: string;
  email: string;
  code: string;
  expiresAt: number;
};

export const emailOtpQueue = new Queue<EmailOtpJob>(QUEUE_NAMES.EMAIL_CRITICAL, {
  connection: createBullMqConnectionOptions(),
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/**
 * API-facing queue boundary. Production always enqueues; the in-memory sink is
 * limited to Vitest so HTTP specs can assert MFA without a running worker.
 */
export async function enqueueEmailOtp(job: EmailOtpJob, jobId: string): Promise<void> {
  if (process.env.VITEST !== undefined) {
    captureMfaOtpForTest(job.email, job.code);
    return;
  }
  await emailOtpQueue.add("send-email-otp", job, { jobId });
}
