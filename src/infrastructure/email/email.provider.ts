export type MfaOtpEmail = {
  recipient: string;
  code: string;
  expiresInSeconds: number;
};

export type OrgActivationEmail = {
  recipient: string;
  organizationName: string;
  adminName: string;
  activationUrl: string;
};

export type EmailDeliveryResult = { messageId?: string };

/**
 * The worker depends on this contract, never on a particular mail vendor.
 * SES SMTP is the production implementation; MailHog is selected locally.
 */
export interface EmailProvider {
  sendMfaOtp(input: MfaOtpEmail): Promise<EmailDeliveryResult>;
  sendOrganizationActivation?(input: OrgActivationEmail): Promise<EmailDeliveryResult>;
}
