-- Allow org-scoped CLI tokens for vendor/TPRM sync (no assessment binding).
ALTER TABLE "cli_tokens" ALTER COLUMN "assessment_id" DROP NOT NULL;
