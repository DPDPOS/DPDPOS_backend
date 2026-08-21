import nodemailer from "nodemailer";
import { appConfig } from "../../config/app.config.js";
import { ServiceUnavailableError } from "../../shared/errors/app-error.js";

let transporter: nodemailer.Transporter | null = null;
const testOtps = new Map<string, string>();

function isTestEnvironment(): boolean {
  return appConfig.env === "test" || process.env.VITEST !== undefined;
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const { host, port, secure, user, password, from } = appConfig.email;
  if (!host || !user || !password || !from) {
    throw new ServiceUnavailableError(
      "Email OTP is unavailable because SMTP is not configured",
    );
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
  });
  return transporter;
}

/** Sends the one-time email code. Codes are never logged. */
export async function sendEmailOtp(input: {
  email: string;
  code: string;
  expiresInSeconds: number;
}): Promise<void> {
  if (isTestEnvironment()) {
    testOtps.set(input.email.toLowerCase(), input.code);
    return;
  }

  await getTransporter().sendMail({
    from: appConfig.email.from,
    to: input.email,
    subject: "Your DPDPOS sign-in code",
    text: `Your DPDPOS verification code is ${input.code}. It expires in ${Math.floor(input.expiresInSeconds / 60)} minutes. Do not share this code.`,
  });
}

/** Test-only helper; it never exposes codes through an HTTP endpoint. */
export function getLastEmailOtpForTest(email: string): string | undefined {
  return testOtps.get(email.toLowerCase());
}
