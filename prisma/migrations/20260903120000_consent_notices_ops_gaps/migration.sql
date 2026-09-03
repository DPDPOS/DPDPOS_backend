-- Phase 2: consent TTL/purposes, notice content format, CM settings

CREATE TYPE "NoticeContentFormat" AS ENUM ('PLAIN', 'MARKDOWN');
CREATE TYPE "ConsentManagerMode" AS ENUM ('NONE', 'EXTERNAL_CM');

ALTER TABLE "notices"
  ADD COLUMN "content_format" "NoticeContentFormat" NOT NULL DEFAULT 'PLAIN';

ALTER TABLE "consent_records"
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "purposes" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill purposes from singular purpose
UPDATE "consent_records"
SET "purposes" = jsonb_build_array("purpose")
WHERE "purposes" = '[]'::jsonb AND "purpose" IS NOT NULL AND "purpose" <> '';

ALTER TABLE "organizations"
  ADD COLUMN "consent_manager_mode" "ConsentManagerMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "consent_manager_url" TEXT;

CREATE INDEX "consent_records_organization_id_expires_at_idx"
  ON "consent_records"("organization_id", "expires_at");
