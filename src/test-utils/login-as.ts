import type { Express } from "express";
import request from "supertest";

import { getLastEmailOtpForTest } from "../infrastructure/email/email-otp.sender.js";

export type LoginSuccessData = {
  mfaRequired: false;
  tokens: { accessToken: string; refreshToken: string };
  user: {
    id: string;
    status: string;
    permissions: string[];
    roles?: string[];
    [key: string]: unknown;
  };
  mfaEnrollmentRequired?: boolean;
};

/**
 * Completes password login through the email-OTP challenge that production
 * `/auth/login` always returns. Integration specs must use this instead of
 * reading `tokens` from the password step alone.
 */
export async function loginWithEmailOtp(
  app: Express,
  credentials: { organizationId: string; email: string; password: string },
): Promise<LoginSuccessData> {
  const challenge = await request(app)
    .post("/api/v1/auth/login")
    .send(credentials)
    .expect(200);

  const data = challenge.body.data as {
    mfaRequired?: boolean;
    mfaToken?: string;
    tokens?: { accessToken?: string; refreshToken?: string };
    user?: LoginSuccessData["user"];
  };

  if (!data?.mfaRequired) {
    if (!data?.tokens?.accessToken || !data.user) {
      throw new Error(
        `Login did not return tokens or an MFA challenge: ${JSON.stringify(data)}`,
      );
    }
    return data as LoginSuccessData;
  }

  const code = getLastEmailOtpForTest(credentials.email);
  if (!code) {
    throw new Error(`No test email OTP captured for ${credentials.email}`);
  }
  if (!data.mfaToken) {
    throw new Error("MFA challenge missing mfaToken");
  }

  const verified = await request(app)
    .post("/api/v1/auth/mfa/verify")
    .send({ mfaToken: data.mfaToken, code })
    .expect(200);

  const success = verified.body.data as LoginSuccessData;
  if (!success?.tokens?.accessToken || !success.user) {
    throw new Error(
      `MFA verify did not return tokens: ${JSON.stringify(verified.body.data)}`,
    );
  }
  return success;
}
