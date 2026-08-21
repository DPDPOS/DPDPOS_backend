import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connectRedis, disconnectRedis, getRedis } from "../../../infrastructure/cache/redis-client.js";
import { classifyEmailDeliveryError } from "../../../infrastructure/email/email-delivery-error.js";
import { hashToken } from "../utils/token-crypto.js";
import { signMfaChallengeToken } from "../utils/mfa-challenge-token.js";
import { AuthService } from "../services/auth.service.js";
import { EMAIL_OTP_JOB_OPTIONS, emailOtpQueue } from "../../../jobs/queues/email-otp.queue.js";
import { EMAIL_OTP_WORKER_LIMITER } from "../jobs/email-otp.worker.js";

describe("email MFA resend reliability", () => {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const challengeId = randomUUID();
  const key = `auth:mfa:email:${challengeId}`;
  const oldCode = "123456";

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await getRedis().del(key);
    await emailOtpQueue.close();
    await disconnectRedis();
  });

  it("restores the previous usable challenge when queue insertion fails", async () => {
    const original = {
      userId,
      organizationId,
      otpHash: hashToken(oldCode),
      attempts: 2,
      resendCount: 0,
      lastSentAt: Date.now() - 31_000,
    };
    await getRedis().set(key, JSON.stringify(original), "EX", 240);
    const token = signMfaChallengeToken({ userId, organizationId, factor: "EMAIL_OTP", challengeId });
    const service = new AuthService(
      { findUserById: async () => ({ id: userId, organizationId, email: "user@example.com", status: "ACTIVE" }) } as never,
      async () => { throw new Error("queue unavailable"); },
    );

    await expect(service.resendMfa({ mfaToken: token }, { ipAddress: `test-${randomUUID()}` })).rejects.toThrow("queue unavailable");

    const restored = JSON.parse((await getRedis().get(key))!) as typeof original;
    expect(restored).toEqual(original);
    expect(await (service as unknown as { verifyEmailOtpChallenge: (claims: { challengeId: string; sub: string; organizationId: string }, code: string) => Promise<string> }).verifyEmailOtpChallenge({ challengeId, sub: userId, organizationId }, oldCode)).toBe("VERIFIED");
  });

  it("classifies temporary SMTP failures as retryable and permanent ones as terminal", () => {
    expect(classifyEmailDeliveryError(Object.assign(new Error("temporary"), { responseCode: 451 }))).not.toHaveProperty("name", "UnrecoverableError");
    expect(classifyEmailDeliveryError(Object.assign(new Error("bad recipient"), { responseCode: 550 }))).toHaveProperty("name", "UnrecoverableError");
    expect(classifyEmailDeliveryError(Object.assign(new Error("bad credentials"), { code: "EAUTH" }))).toHaveProperty("name", "UnrecoverableError");
  });

  it("does not consume broader resend quota during cooldown and returns the remaining TTL", async () => {
    const now = Date.now();
    const challenge = { userId, organizationId, otpHash: hashToken("654321"), attempts: 0, resendCount: 0, lastSentAt: now };
    const userRateKey = `auth:mfa:resend:user:${userId}`;
    await getRedis().set(key, JSON.stringify(challenge), "EX", 240);
    await getRedis().del(userRateKey);
    const token = signMfaChallengeToken({ userId, organizationId, factor: "EMAIL_OTP", challengeId });
    const service = new AuthService(
      { findUserById: async () => ({ id: userId, organizationId, email: "user@example.com", status: "ACTIVE" }) } as never,
      async () => undefined,
    );

    await expect(service.resendMfa({ mfaToken: token }, { ipAddress: `cooldown-${randomUUID()}` })).rejects.toThrow("Wait 30 seconds");
    expect(await getRedis().get(userRateKey)).toBeNull();

    challenge.lastSentAt = now - 31_000;
    await getRedis().set(key, JSON.stringify(challenge), "EX", 240);
    const resent = await service.resendMfa({ mfaToken: token }, { ipAddress: `ttl-${randomUUID()}` });
    expect(resent.expiresIn).toBeLessThanOrEqual(240);
    expect(resent.expiresIn).toBeGreaterThan(0);
  });

  it("uses bounded OTP job retention, exponential retries, and a distributed limiter", () => {
    expect(EMAIL_OTP_JOB_OPTIONS).toMatchObject({
      attempts: 4,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 600, count: 100 },
      removeOnFail: { age: 3_600, count: 500 },
    });
    expect(EMAIL_OTP_WORKER_LIMITER.max).toBeGreaterThan(0);
    expect(EMAIL_OTP_WORKER_LIMITER.duration).toBeGreaterThan(0);
  });
});
