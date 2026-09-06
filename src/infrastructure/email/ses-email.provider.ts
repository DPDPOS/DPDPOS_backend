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

  async sendOrganizationActivation(input: {
    recipient: string;
    organizationName: string;
    adminName: string;
    activationUrl: string;
  }): Promise<EmailDeliveryResult> {
    if (testEnvironment()) {
      testOtps.set(`activation:${input.recipient.toLowerCase()}`, input.activationUrl);
      return {};
    }
    const info = await transport().sendMail({
      from: appConfig.email.from,
      to: input.recipient,
      subject: `Activate your DPDPOS account — ${input.organizationName}`,
      text: `Hello ${input.adminName},\n\nYour organization "${input.organizationName}" has been registered on DPDPOS.\n\nPlease activate your account and access your DPDP compliance portal by clicking the link below:\n\n${input.activationUrl}\n\nThis link is valid for 24 hours.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0b0f19; color: #f1f5f9; border-radius: 8px; border: 1px solid #1e293b;">
          <h2 style="color: #6366f1; margin-top: 0;">🛡️ Activate Your DPDP Compliance Portal</h2>
          <p>Hello <strong>${input.adminName}</strong>,</p>
          <p>Your organization <strong>${input.organizationName}</strong> has been registered on DPDPOS Compliance OS.</p>
          <div style="margin: 28px 0;">
            <a href="${input.activationUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              Activate Organization & Sign In →
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">Or copy and paste this link in your browser:</p>
          <p style="color: #64748b; font-size: 12px; word-break: break-all;">${input.activationUrl}</p>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
          <p style="color: #64748b; font-size: 12px;">This activation link is valid for 24 hours. If you did not request this registration, you can ignore this email.</p>
        </div>
      `,
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

/** Test-only helper to inspect activation URL in integration tests. */
export function getLastActivationUrlForTest(email: string): string | undefined {
  return testOtps.get(`activation:${email.toLowerCase()}`);
}

/** Test harness only: simulates a completed worker delivery without SMTP. */
export function captureMfaOtpForTest(email: string, code: string): void {
  testOtps.set(email.toLowerCase(), code);
}
