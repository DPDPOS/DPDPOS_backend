-- Developer C: evidence, audit, reports, notifications, and AI usage.

CREATE TYPE "EvidenceStatus" AS ENUM ('UPLOADED', 'TAGGED', 'MAPPED', 'UNDER_REVIEW', 'APPROVED', 'LOCKED');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'CSV', 'EXCEL');
CREATE TYPE "ReportType" AS ENUM ('COMPLIANCE_SUMMARY', 'BOARD_PACK', 'VIOLATION_REPORT', 'EVIDENCE_REPORT', 'VALIDATION_REPORT', 'CONSENT_REPORT', 'RIGHTS_REPORT', 'AUDIT_REPORT');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'SLACK', 'TEAMS', 'WEBHOOK');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
CREATE TYPE "AiUseCase" AS ENUM ('SUMMARIZE', 'DRAFT', 'EXPLAIN', 'SEARCH');
CREATE TYPE "AiRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "evidence_files" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_hash" TEXT,
  "file_size_bytes" INTEGER,
  "description" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "EvidenceStatus" NOT NULL DEFAULT 'UPLOADED',
  "control_id" UUID,
  "violation_id" UUID,
  "uploaded_by" UUID,
  "reviewed_by" UUID,
  "approved_by" UUID,
  "locked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "report_type" "ReportType" NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "format" "ReportFormat" NOT NULL DEFAULT 'PDF',
  "generated_by" UUID NOT NULL,
  "storage_key" TEXT,
  "parameters" JSONB,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "notification_type" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "sent_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "related_entity_type" TEXT,
  "related_entity_id" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_usage_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "use_case" "AiUseCase" NOT NULL,
  "module" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "prompt_version" TEXT NOT NULL DEFAULT 'v1',
  "prompt_text" TEXT,
  "result_text" TEXT,
  "tokens_in" INTEGER NOT NULL DEFAULT 0,
  "tokens_out" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "estimated_cost" DOUBLE PRECISION,
  "status" "AiRequestStatus" NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidence_files_organization_id_idx" ON "evidence_files"("organization_id");
CREATE INDEX "evidence_files_organization_id_status_idx" ON "evidence_files"("organization_id", "status");
CREATE INDEX "evidence_files_control_id_idx" ON "evidence_files"("control_id");
CREATE INDEX "evidence_files_violation_id_idx" ON "evidence_files"("violation_id");
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");
CREATE INDEX "audit_logs_organization_id_action_type_idx" ON "audit_logs"("organization_id", "action_type");
CREATE INDEX "audit_logs_organization_id_actor_user_id_idx" ON "audit_logs"("organization_id", "actor_user_id");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "reports_organization_id_idx" ON "reports"("organization_id");
CREATE INDEX "reports_organization_id_status_idx" ON "reports"("organization_id", "status");
CREATE INDEX "reports_organization_id_report_type_idx" ON "reports"("organization_id", "report_type");
CREATE INDEX "notifications_organization_id_idx" ON "notifications"("organization_id");
CREATE INDEX "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");
CREATE INDEX "notifications_recipient_user_id_status_idx" ON "notifications"("recipient_user_id", "status");
CREATE INDEX "notifications_organization_id_notification_type_idx" ON "notifications"("organization_id", "notification_type");
CREATE INDEX "ai_usage_logs_organization_id_idx" ON "ai_usage_logs"("organization_id");
CREATE INDEX "ai_usage_logs_organization_id_use_case_idx" ON "ai_usage_logs"("organization_id", "use_case");
CREATE INDEX "ai_usage_logs_organization_id_status_idx" ON "ai_usage_logs"("organization_id", "status");

ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_violation_id_fkey" FOREIGN KEY ("violation_id") REFERENCES "violations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
