-- Compliance gaps: phase/sdf on controls, requirement status, assessment/framework links

CREATE TYPE "RequirementStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SATISFIED', 'VERIFIED', 'NOT_APPLICABLE');

ALTER TABLE "controls" ADD COLUMN IF NOT EXISTS "phase" TEXT;
ALTER TABLE "controls" ADD COLUMN IF NOT EXISTS "sdf_overlay" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "requirements" ADD COLUMN IF NOT EXISTS "status" "RequirementStatus" NOT NULL DEFAULT 'NOT_STARTED';

ALTER TABLE "violations" ADD COLUMN IF NOT EXISTS "control_id" UUID;
ALTER TABLE "violations" ADD COLUMN IF NOT EXISTS "assessment_control_code" TEXT;

ALTER TABLE "remediation_tasks" ADD COLUMN IF NOT EXISTS "control_id" UUID;

ALTER TABLE "assessment_control_results" ADD COLUMN IF NOT EXISTS "framework_control_code" TEXT;

CREATE INDEX IF NOT EXISTS "violations_control_id_idx" ON "violations"("control_id");
CREATE INDEX IF NOT EXISTS "assessment_control_results_framework_control_code_idx" ON "assessment_control_results"("framework_control_code");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'violations_control_id_fkey'
  ) THEN
    ALTER TABLE "violations"
      ADD CONSTRAINT "violations_control_id_fkey"
      FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'remediation_tasks_control_id_fkey'
  ) THEN
    ALTER TABLE "remediation_tasks"
      ADD CONSTRAINT "remediation_tasks_control_id_fkey"
      FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Migrate legacy phase values on existing controls
UPDATE "controls" SET "phase" = 'Governance' WHERE "phase" = 'Oversight';
UPDATE "controls" SET "phase" = 'Foundation', "sdf_overlay" = true
  WHERE "phase" = 'Significant Fiduciary' AND "code" = 'CTRL-SDF-DPO';
UPDATE "controls" SET "phase" = 'Governance', "sdf_overlay" = true
  WHERE "phase" = 'Significant Fiduciary' AND "code" IN ('CTRL-SDF-AUDIT', 'CTRL-SDF-DPIA');
