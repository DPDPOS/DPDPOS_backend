import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { processEmailOtpJob, startEmailOtpWorker, stopEmailOtpWorker } from "../jobs/email-otp.worker.js";
import type { EmailOtpJob } from "../../../jobs/queues/email-otp.queue.js";

function job(data: Partial<EmailOtpJob> = {}) {
  return {
    id: "mfa:test:0",
    data: {
      challengeId: "challenge-1",
      userId: "user-1",
      email: "user@example.com",
      code: "123456",
      expiresAt: Date.now() + 60_000,
      ...data,
    },
  };
}

function dependencies(sendMfaOtp = vi.fn().mockResolvedValue({ messageId: "message-1" })) {
  return {
    provider: { sendMfaOtp },
    redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") },
  };
}

describe("email OTP worker processor", () => {
  it("sends a valid job and records best-effort delivery state", async () => {
    const deps = dependencies();
    await processEmailOtpJob(job(), deps);
    expect(deps.provider.sendMfaOtp).toHaveBeenCalledOnce();
    expect(deps.redis.set).toHaveBeenCalledWith("auth:mfa:delivery:mfa:test:0", "SENT", "EX", 600);
  });

  it("does not send expired OTP jobs", async () => {
    const deps = dependencies();
    await processEmailOtpJob(job({ expiresAt: Date.now() - 1 }), deps);
    expect(deps.provider.sendMfaOtp).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads without retrying", async () => {
    await expect(processEmailOtpJob(job({ code: "bad" }), dependencies())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("retries transient provider failures and stops permanent failures", async () => {
    await expect(processEmailOtpJob(job(), dependencies(vi.fn().mockRejectedValue(Object.assign(new Error("temporary"), { responseCode: 451 }))))).rejects.not.toBeInstanceOf(UnrecoverableError);
    await expect(processEmailOtpJob(job(), dependencies(vi.fn().mockRejectedValue(Object.assign(new Error("bad recipient"), { responseCode: 550 }))))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("can be stopped safely when it was never started", async () => {
    await expect(stopEmailOtpWorker()).resolves.toBeUndefined();
  });

  it("closes a started worker gracefully", async () => {
    startEmailOtpWorker();
    await expect(stopEmailOtpWorker()).resolves.toBeUndefined();
  });
});
