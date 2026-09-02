-- Prerequisite once-per-org DPDP onboarding (gates assessments; not per-login).

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboarding_completed_by" UUID;

CREATE TABLE IF NOT EXISTS "organization_onboarding_answers" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "question_code" TEXT NOT NULL,
  "value_json" JSONB NOT NULL,
  "answered_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_onboarding_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_onboarding_answers_organization_id_question_code_key"
  ON "organization_onboarding_answers"("organization_id", "question_code");

CREATE INDEX IF NOT EXISTS "organization_onboarding_answers_organization_id_idx"
  ON "organization_onboarding_answers"("organization_id");

ALTER TABLE "organization_onboarding_answers"
  DROP CONSTRAINT IF EXISTS "organization_onboarding_answers_organization_id_fkey";

ALTER TABLE "organization_onboarding_answers"
  ADD CONSTRAINT "organization_onboarding_answers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Orgs that already ran assessments are treated as onboarded (once-per-tenant flag).
UPDATE "organizations" o
SET "onboarding_completed_at" = COALESCE(o."onboarding_completed_at", NOW())
WHERE o."deleted_at" IS NULL
  AND o."onboarding_completed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "assessments" a
    WHERE a."organization_id" = o."id" AND a."deleted_at" IS NULL
  );
