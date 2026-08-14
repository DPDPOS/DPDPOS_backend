-- AlterEnum
CREATE TYPE "IdentityMode" AS ENUM ('LOCAL', 'LDAP_AD', 'OIDC_ENTRA', 'SAML_ADFS', 'HYBRID');
CREATE TYPE "IdentityProviderType" AS ENUM ('LDAP', 'OIDC', 'SAML');
CREATE TYPE "UserAuthSource" AS ENUM ('LOCAL', 'LDAP', 'OIDC', 'SAML');

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "auth_source" "UserAuthSource" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "users" ADD COLUMN "external_subject" TEXT;
ALTER TABLE "users" ADD COLUMN "external_issuer" TEXT;
ALTER TABLE "users" ADD COLUMN "upn" TEXT;

CREATE UNIQUE INDEX "users_organization_id_external_subject_key" ON "users"("organization_id", "external_subject");
CREATE INDEX "users_organization_id_upn_idx" ON "users"("organization_id", "upn");

-- CreateTable
CREATE TABLE "organization_identity_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mode" "IdentityMode" NOT NULL DEFAULT 'LOCAL',
    "enforce_sso" BOOLEAN NOT NULL DEFAULT false,
    "allow_local_break_glass" BOOLEAN NOT NULL DEFAULT true,
    "disable_local_totp_when_federated" BOOLEAN NOT NULL DEFAULT true,
    "jit_provisioning_enabled" BOOLEAN NOT NULL DEFAULT false,
    "default_role_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_identity_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_identity_settings_organization_id_key" ON "organization_identity_settings"("organization_id");

ALTER TABLE "organization_identity_settings"
  ADD CONSTRAINT "organization_identity_settings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "identity_providers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "IdentityProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "issuer" TEXT,
    "client_id" TEXT,
    "client_secret_enc" TEXT,
    "tenant_id" TEXT,
    "scopes" TEXT,
    "entity_id" TEXT,
    "acs_url" TEXT,
    "idp_metadata_url" TEXT,
    "idp_certificate" TEXT,
    "ldap_host" TEXT,
    "ldap_port" INTEGER,
    "ldap_use_tls" BOOLEAN,
    "ldap_bind_dn_enc" TEXT,
    "ldap_bind_password_enc" TEXT,
    "ldap_base_dn" TEXT,
    "ldap_user_filter" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "identity_providers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_providers_organization_id_type_enabled_idx" ON "identity_providers"("organization_id", "type", "enabled");

ALTER TABLE "identity_providers"
  ADD CONSTRAINT "identity_providers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "identity_group_role_maps" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "external_group_id" TEXT NOT NULL,
    "external_group_name" TEXT,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_group_role_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_group_role_maps_organization_id_provider_id_external_group_id_role_id_key"
  ON "identity_group_role_maps"("organization_id", "provider_id", "external_group_id", "role_id");
CREATE INDEX "identity_group_role_maps_organization_id_provider_id_idx"
  ON "identity_group_role_maps"("organization_id", "provider_id");

ALTER TABLE "identity_group_role_maps"
  ADD CONSTRAINT "identity_group_role_maps_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_group_role_maps"
  ADD CONSTRAINT "identity_group_role_maps_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "identity_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_group_role_maps"
  ADD CONSTRAINT "identity_group_role_maps_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "identity_sync_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "users_created" INTEGER NOT NULL DEFAULT 0,
    "users_updated" INTEGER NOT NULL DEFAULT 0,
    "users_disabled" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "identity_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_sync_runs_organization_id_started_at_idx" ON "identity_sync_runs"("organization_id", "started_at");

ALTER TABLE "identity_sync_runs"
  ADD CONSTRAINT "identity_sync_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_sync_runs"
  ADD CONSTRAINT "identity_sync_runs_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "identity_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grant new identity permissions to existing system roles (idempotent).
UPDATE "roles"
SET "permissions" = (
  SELECT ARRAY(
    SELECT DISTINCT p
    FROM unnest("permissions" || ARRAY['identity:read','identity:update','identity:sync']::TEXT[]) AS p
  )
)
WHERE "is_system_role" = true AND "name" = 'ORG_ADMIN';

UPDATE "roles"
SET "permissions" = (
  SELECT ARRAY(
    SELECT DISTINCT p
    FROM unnest("permissions" || ARRAY['identity:read','identity:update','identity:sync']::TEXT[]) AS p
  )
)
WHERE "is_system_role" = true AND "name" = 'DPO';

UPDATE "roles"
SET "permissions" = (
  SELECT ARRAY(
    SELECT DISTINCT p
    FROM unnest("permissions" || ARRAY['identity:read']::TEXT[]) AS p
  )
)
WHERE "is_system_role" = true AND "name" = 'AUDITOR';
