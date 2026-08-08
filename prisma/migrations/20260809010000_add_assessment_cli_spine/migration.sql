-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY_FOR_EVALUATION', 'EVALUATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ControlEvalStatus" AS ENUM ('PASS', 'PARTIAL', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AssessmentActorType" AS ENUM ('USER', 'CLI', 'SYSTEM');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_versions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "label" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_documents" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "content_base64" TEXT,
    "extracted_text" TEXT,
    "checksum" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questionnaire_answers" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "question_code" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "answered_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cli_tokens" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scan_jobs" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_path" TEXT NOT NULL,
    "cli_version" TEXT NOT NULL,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'PENDING',
    "findings_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cli_findings" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scan_job_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "finding_type" TEXT NOT NULL,
    "excerpt" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "control_candidates" TEXT[],
    "source_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_control_results" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "control_code" TEXT NOT NULL,
    "status" "ControlEvalStatus" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "reasoning" TEXT NOT NULL,
    "evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_control_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_reports" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "summary" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_audit_events" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" "AssessmentActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT,
    "payload_hash" TEXT NOT NULL,
    "event_hash" TEXT NOT NULL,
    "prev_event_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_audit_events_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "cli_tokens_token_hash_key" ON "cli_tokens"("token_hash");
CREATE UNIQUE INDEX "assessment_versions_assessment_id_version_number_key" ON "assessment_versions"("assessment_id", "version_number");
CREATE UNIQUE INDEX "questionnaire_answers_assessment_id_version_number_question_code_key" ON "questionnaire_answers"("assessment_id", "version_number", "question_code");
CREATE UNIQUE INDEX "assessment_control_results_assessment_id_version_number_control_code_key" ON "assessment_control_results"("assessment_id", "version_number", "control_code");
CREATE UNIQUE INDEX "assessment_reports_assessment_id_version_number_key" ON "assessment_reports"("assessment_id", "version_number");

CREATE INDEX "assessments_organization_id_status_idx" ON "assessments"("organization_id", "status");
CREATE INDEX "assessment_versions_organization_id_assessment_id_idx" ON "assessment_versions"("organization_id", "assessment_id");
CREATE INDEX "assessment_documents_assessment_id_version_number_idx" ON "assessment_documents"("assessment_id", "version_number");
CREATE INDEX "assessment_documents_organization_id_idx" ON "assessment_documents"("organization_id");
CREATE INDEX "questionnaire_answers_organization_id_idx" ON "questionnaire_answers"("organization_id");
CREATE INDEX "cli_tokens_assessment_id_idx" ON "cli_tokens"("assessment_id");
CREATE INDEX "cli_tokens_organization_id_idx" ON "cli_tokens"("organization_id");
CREATE INDEX "scan_jobs_assessment_id_version_number_idx" ON "scan_jobs"("assessment_id", "version_number");
CREATE INDEX "scan_jobs_organization_id_idx" ON "scan_jobs"("organization_id");
CREATE INDEX "cli_findings_assessment_id_version_number_idx" ON "cli_findings"("assessment_id", "version_number");
CREATE INDEX "cli_findings_scan_job_id_idx" ON "cli_findings"("scan_job_id");
CREATE INDEX "cli_findings_organization_id_idx" ON "cli_findings"("organization_id");
CREATE INDEX "assessment_control_results_organization_id_idx" ON "assessment_control_results"("organization_id");
CREATE INDEX "assessment_reports_organization_id_idx" ON "assessment_reports"("organization_id");
CREATE INDEX "assessment_audit_events_assessment_id_created_at_idx" ON "assessment_audit_events"("assessment_id", "created_at");
CREATE INDEX "assessment_audit_events_organization_id_idx" ON "assessment_audit_events"("organization_id");

-- FKs
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_documents" ADD CONSTRAINT "assessment_documents_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cli_tokens" ADD CONSTRAINT "cli_tokens_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cli_findings" ADD CONSTRAINT "cli_findings_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cli_findings" ADD CONSTRAINT "cli_findings_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_control_results" ADD CONSTRAINT "assessment_control_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_audit_events" ADD CONSTRAINT "assessment_audit_events_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
