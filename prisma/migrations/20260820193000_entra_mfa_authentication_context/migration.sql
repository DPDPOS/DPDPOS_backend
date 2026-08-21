-- Entra MFA must be proven by a tenant-owned Conditional Access Authentication
-- Context, rather than trusting an arbitrary interactive federated sign-in.
ALTER TABLE "identity_providers"
  ADD COLUMN IF NOT EXISTS "mfa_authentication_context" TEXT;

-- Existing organisations fall back to their in-app TOTP until an administrator
-- configures an Entra MFA Authentication Context and opts in explicitly.
ALTER TABLE "organization_identity_settings"
  ALTER COLUMN "disable_local_totp_when_federated" SET DEFAULT false;

UPDATE "organization_identity_settings"
SET "disable_local_totp_when_federated" = false
WHERE "disable_local_totp_when_federated" = true;
