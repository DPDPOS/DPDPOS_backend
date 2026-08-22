-- AlterTable: add optional AI enrichment context to scan_jobs.
-- Informational only — does NOT affect deterministic control evaluation.
ALTER TABLE "scan_jobs" ADD COLUMN "ai_context" JSONB;
