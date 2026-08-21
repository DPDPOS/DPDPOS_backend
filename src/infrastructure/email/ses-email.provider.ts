import nodemailer from "nodemailer";
import { appConfig } from "../../config/app.config.js";
import { ServiceUnavailableError } from "../../shared/errors/app-error.js";
import type { EmailDeliveryResult, EmailProvider, MfaOtpEmail } from "./email.provider.js";

let transporter: nodemailer.Transporter | null = null;
const testOtps = new Map<string, string>();

function testEnvironment(): boolean {
  return appConfig.env === "test" || process.env.VITEST !== undefined;
}

function transport(): nodemailer.Transporter {
  if (transporter) return transporter;
  const email = appConfig.email;
  if (!email.host || !email.from || (email.requireAuth && (!email.user || !email.password))) {
    throw new ServiceUnavailableError("Critical email delivery is not configured");
  }
  transporter = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    requireTLS: appConfig.email.provider === "SES_SMTP",
    ...(email.requireAuth ? { auth: { user: email.user!, pass: email.password! } } : {}),
  });
  return transporter;
}

class SmtpEmailProvider implements EmailProvider {
  async sendMfaOtp(input: MfaOtpEmail): Promise<EmailDeliveryResult> {
    if (testEnvironment()) {
      testOtps.set(input.recipient.toLowerCase(), input.code);
      return {};
    }
    const info = await transport().sendMail({
      from: appConfig.email.from,
      to: input.recipient,
      subject: "Your DPDPOS sign-in code",
      text: `Your DPDPOS verification code is ${input.code}. It expires in ${Math.max(1, Math.ceil(input.expiresInSeconds / 60))} minutes. Do not share this code.`,
    });
    return { messageId: info.messageId };
  }
}

const provider: EmailProvider = new SmtpEmailProvider();
export function getEmailProvider(): EmailProvider { return provider; }

/** Test-only helper. It is never exposed by the HTTP API. */
export function getLastEmailOtpForTest(email: string): string | undefined {
  return testOtps.get(email.toLowerCase());
}

/** Test harness only: simulates a completed worker delivery without SMTP. */
export function captureMfaOtpForTest(email: string, code: string): void {
  testOtps.set(email.toLowerCase(), code);
}
