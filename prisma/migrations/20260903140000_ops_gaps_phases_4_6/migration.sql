-- Phase 4–6 ops gaps: DSR routing/checklist, inventory links/countries, vendor portal, CM webhook secret

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "dsr_routing_json" JSONB,
  ADD COLUMN IF NOT EXISTS "consent_manager_webhook_secret" TEXT;

ALTER TABLE "data_subject_requests"
  ADD COLUMN IF NOT EXISTS "verification_checklist_json" JSONB;

ALTER TABLE "data_assets"
  ADD COLUMN IF NOT EXISTS "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "processing_activities"
  ADD COLUMN IF NOT EXISTS "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$ BEGIN
  CREATE TYPE "DataAssetLinkType" AS ENUM ('FEEDS', 'DERIVES', 'COPIES');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "data_asset_links" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "from_asset_id" UUID NOT NULL,
  "to_asset_id" UUID NOT NULL,
  "link_type" "DataAssetLinkType" NOT NULL,
  "notes" TEXT,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "data_asset_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "data_asset_links_organization_id_from_asset_id_to_asset_id_link_type_key"
  ON "data_asset_links"("organization_id", "from_asset_id", "to_asset_id", "link_type");
CREATE INDEX IF NOT EXISTS "data_asset_links_organization_id_idx" ON "data_asset_links"("organization_id");
CREATE INDEX IF NOT EXISTS "data_asset_links_from_asset_id_idx" ON "data_asset_links"("from_asset_id");
CREATE INDEX IF NOT EXISTS "data_asset_links_to_asset_id_idx" ON "data_asset_links"("to_asset_id");

DO $$ BEGIN
  ALTER TABLE "data_asset_links"
    ADD CONSTRAINT "data_asset_links_from_asset_id_fkey"
    FOREIGN KEY ("from_asset_id") REFERENCES "data_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "data_asset_links"
    ADD CONSTRAINT "data_asset_links_to_asset_id_fkey"
    FOREIGN KEY ("to_asset_id") REFERENCES "data_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "vendor_portal_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "contact_email" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_portal_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_portal_tokens_token_hash_key" ON "vendor_portal_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "vendor_portal_tokens_organization_id_idx" ON "vendor_portal_tokens"("organization_id");
CREATE INDEX IF NOT EXISTS "vendor_portal_tokens_vendor_id_idx" ON "vendor_portal_tokens"("vendor_id");

DO $$ BEGIN
  ALTER TABLE "vendor_portal_tokens"
    ADD CONSTRAINT "vendor_portal_tokens_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
