-- Assessment version freeze snapshot (prior report + summary at bump time)
ALTER TABLE "assessment_versions" ADD COLUMN "snapshot_json" JSONB;
ALTER TABLE "assessment_versions" ADD COLUMN "readiness_score" DOUBLE PRECISION;

-- Link violations opened from assessment FAIL controls (idempotent source key)
ALTER TABLE "violations" ADD COLUMN "source_key" TEXT;
CREATE UNIQUE INDEX "violations_organization_id_source_key_key" ON "violations"("organization_id", "source_key") WHERE "source_key" IS NOT NULL;
