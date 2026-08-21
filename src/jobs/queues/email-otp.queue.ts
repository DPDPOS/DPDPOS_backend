import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "./queue-names.js";

export type EmailOtpJob = {
  email: string;
  code: string;
  expiresAt: number;
};

export const emailOtpQueue = new Queue<EmailOtpJob>(QUEUE_NAMES.EMAIL_OTP, {
  connection: createBullMqConnectionOptions(),
});
