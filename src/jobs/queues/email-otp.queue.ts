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

export const EMAIL_OTP_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: "exponential" as const, delay: 1_000 },
  // Job data includes an OTP. Retention is bounded by both age and count.
  removeOnComplete: { age: 600, count: 100 },
  removeOnFail: { age: 3_600, count: 500 },
};

export const emailOtpQueue = new Queue<EmailOtpJob>(QUEUE_NAMES.EMAIL_CRITICAL, {
  connection: createBullMqConnectionOptions(),
  defaultJobOptions: EMAIL_OTP_JOB_OPTIONS,
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
