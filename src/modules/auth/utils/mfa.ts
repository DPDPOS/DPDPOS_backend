import { authenticator } from "otplib";

export const MFA_PRIVILEGED_ROLES = ["ORG_ADMIN", "DPO", "AUDITOR"] as const;

export function isPrivilegedRoleSet(roles: readonly string[]): boolean {
  return roles.some((role) =>
    (MFA_PRIVILEGED_ROLES as readonly string[]).includes(role),
  );
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(input: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  return authenticator.keyuri(
    input.email,
    input.issuer ?? "DPDPOS",
    input.secret,
  );
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.check(code.replace(/\s/g, ""), secret);
}
