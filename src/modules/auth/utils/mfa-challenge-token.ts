import jwt from "jsonwebtoken";
import { z } from "zod";
import { appConfig } from "../../../config/app.config.js";
import { UnauthorizedError } from "../../../shared/errors/app-error.js";

const mfaChallengeSchema = z.object({
  purpose: z.literal("mfa_challenge"),
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  factor: z.enum(["TOTP", "EMAIL_OTP"]).default("TOTP"),
});

export type MfaChallengeClaims = z.infer<typeof mfaChallengeSchema>;

const MFA_CHALLENGE_TTL_SECONDS = 300;

export function signMfaChallengeToken(input: {
  userId: string;
  organizationId: string;
  factor?: "TOTP" | "EMAIL_OTP";
}): string {
  return jwt.sign(
    {
      purpose: "mfa_challenge",
      sub: input.userId,
      organizationId: input.organizationId,
      factor: input.factor ?? "TOTP",
    },
    appConfig.jwt.accessSecret,
    { expiresIn: MFA_CHALLENGE_TTL_SECONDS },
  );
}

export function verifyMfaChallengeToken(token: string): MfaChallengeClaims {
  try {
    const decoded = jwt.verify(token, appConfig.jwt.accessSecret);
    const parsed = mfaChallengeSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new UnauthorizedError("Invalid MFA challenge token");
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid or expired MFA challenge token");
  }
}
