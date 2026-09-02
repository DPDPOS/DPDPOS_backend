-- Agent Control Plane foundational schema.

CREATE TYPE "DeploymentTier" AS ENUM ('COMMUNITY', 'ENTERPRISE', 'MANAGED');
CREATE TYPE "AgentState" AS ENUM ('PENDING', 'ACTIVE', 'DEGRADED', 'OFFLINE', 'REVOKED');
CREATE TYPE "AgentTaskType" AS ENUM ('DISCOVERY', 'DSR_ACCESS', 'DSR_CORRECTION', 'DSR_ERASURE', 'CONSENT_SNAPSHOT', 'COMPLIANCE_SCAN');
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'DISPATCHED', 'ACKNOWLEDGED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'ESCALATED');
CREATE TYPE "FindingSource" AS ENUM ('AGENT', 'ASSESSMENT', 'VALIDATION', 'MANUAL');
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "DataAssetSource" AS ENUM ('MANUAL', 'AGENT', 'IMPORT');
CREATE TYPE "ErasureDispatchMode" AS ENUM ('MANUAL', 'AGENT', 'WEBHOOK');
CREATE TYPE "LedgerActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM');

CREATE TABLE "organization_control_plane_settings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "deployment_tier" "DeploymentTier" NOT NULL DEFAULT 'COMMUNITY',
  "agent_mtls_required" BOOLEAN NOT NULL DEFAULT false,
  "discovery_enabled" BOOLEAN NOT NULL DEFAULT true,
  "dsr_dispatch_enabled" BOOLEAN NOT NULL DEFAULT false,
  "consent_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
  "scope_profile_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_control_plane_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_enrollment_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "label" TEXT,
  "scope_profile_json" JSONB,
  "max_uses" INTEGER NOT NULL DEFAULT 1,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_enrollment_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_enrollment_tokens_usage_check" CHECK ("max_uses" > 0 AND "use_count" >= 0 AND "use_count" <= "max_uses")
);

CREATE TABLE "agents" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "enrollment_token_id" UUID,
  "name" TEXT NOT NULL,
  "state" "AgentState" NOT NULL DEFAULT 'PENDING',
  "agent_version" TEXT NOT NULL,
  "instance_key" TEXT NOT NULL,
  "platform" TEXT,
  "hostname" TEXT,
  "capabilities_json" JSONB,
  "scope_profile_json" JSONB,
  "metadata_json" JSONB,
  "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_heartbeat_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_certificates" (
  "id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "serial_number" TEXT NOT NULL,
  "fingerprint_sha256" TEXT NOT NULL,
  "certificate_pem" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "replaced_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tasks" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "data_subject_request_id" UUID,
  "type" "AgentTaskType" NOT NULL,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
  "dedupe_key" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "result_json" JSONB,
  "failure_reason" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatched_at" TIMESTAMP(3),
  "acknowledged_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "requested_by" UUID,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_tasks_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE TABLE "data_systems" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "external_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "system_type" TEXT NOT NULL,
  "connector_key" TEXT,
  "environment" TEXT,
  "location" TEXT,
  "metadata_json" JSONB,
  "first_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_fields" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "system_id" UUID NOT NULL,
  "data_asset_id" UUID,
  "external_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "path" TEXT,
  "data_type" TEXT,
  "nullable" BOOLEAN,
  "pii" BOOLEAN NOT NULL DEFAULT false,
  "pii_category" TEXT,
  "confidence" DOUBLE PRECISION,
  "tags_json" JSONB,
  "metadata_json" JSONB,
  "first_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_fields_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE TABLE "catalog_revisions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "report_hash" TEXT NOT NULL,
  "report_json" JSONB NOT NULL,
  "summary_json" JSONB,
  "discovered_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_revisions_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "identity_graph_edges" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "system_id" UUID NOT NULL,
  "source_identity_hash" TEXT NOT NULL,
  "target_identity_hash" TEXT NOT NULL,
  "edge_type" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "evidence_json" JSONB,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "identity_graph_edges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_graph_edges_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE TABLE "compliance_findings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "agent_id" UUID,
  "system_id" UUID,
  "data_asset_id" UUID,
  "catalog_revision_id" UUID,
  "source" "FindingSource" NOT NULL,
  "source_key" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "rule_code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "severity" "FindingSeverity" NOT NULL,
  "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
  "evidence_json" JSONB,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_ledger_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sequence" BIGINT NOT NULL,
  "actor_type" "LedgerActorType" NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "previous_hash" TEXT,
  "entry_hash" TEXT NOT NULL,
  "signature" TEXT,
  "metadata_json" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_ledger_entries_sequence_check" CHECK ("sequence" > 0)
);

CREATE TABLE "plugins" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "plugin_key" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "manifest_json" JSONB NOT NULL,
  "artifact_uri" TEXT NOT NULL,
  "artifact_sha256" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rulepacks" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "rulepack_key" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "framework" TEXT,
  "manifest_json" JSONB NOT NULL,
  "rules_json" JSONB NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rulepacks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "data_assets"
  ADD COLUMN "source" "DataAssetSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "system_id" UUID,
  ADD COLUMN "agent_id" UUID,
  ADD COLUMN "field_schema_json" JSONB,
  ADD COLUMN "pii_tags_json" JSONB,
  ADD COLUMN "last_discovered_at" TIMESTAMP(3);

ALTER TABLE "violations"
  ADD COLUMN "finding_source" "FindingSource" NOT NULL DEFAULT 'VALIDATION',
  ADD COLUMN "dedupe_key" TEXT,
  ADD COLUMN "compliance_finding_id" UUID,
  ADD COLUMN "agent_id" UUID,
  ADD COLUMN "assessment_id" UUID;

ALTER TABLE "erasure_checklist_items"
  ADD COLUMN "agent_task_id" UUID,
  ADD COLUMN "dispatch_mode" "ErasureDispatchMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "execution_proof" JSONB,
  ADD COLUMN "rows_affected" INTEGER,
  ADD COLUMN "failure_reason" TEXT,
  ADD CONSTRAINT "erasure_checklist_items_rows_affected_check" CHECK ("rows_affected" IS NULL OR "rows_affected" >= 0);

CREATE UNIQUE INDEX "organization_control_plane_settings_organization_id_key" ON "organization_control_plane_settings"("organization_id");
CREATE UNIQUE INDEX "agent_enrollment_tokens_token_hash_key" ON "agent_enrollment_tokens"("token_hash");
CREATE INDEX "agent_enrollment_tokens_organization_id_expires_at_idx" ON "agent_enrollment_tokens"("organization_id", "expires_at");
CREATE UNIQUE INDEX "agents_organization_id_instance_key_key" ON "agents"("organization_id", "instance_key");
CREATE INDEX "agents_organization_id_state_idx" ON "agents"("organization_id", "state");
CREATE INDEX "agents_last_heartbeat_at_idx" ON "agents"("last_heartbeat_at");
CREATE UNIQUE INDEX "agent_certificates_serial_number_key" ON "agent_certificates"("serial_number");
CREATE UNIQUE INDEX "agent_certificates_fingerprint_sha256_key" ON "agent_certificates"("fingerprint_sha256");
CREATE INDEX "agent_certificates_agent_id_expires_at_idx" ON "agent_certificates"("agent_id", "expires_at");
CREATE UNIQUE INDEX "agent_tasks_organization_id_dedupe_key_key" ON "agent_tasks"("organization_id", "dedupe_key");
CREATE INDEX "agent_tasks_agent_id_status_available_at_idx" ON "agent_tasks"("agent_id", "status", "available_at");
CREATE INDEX "agent_tasks_data_subject_request_id_idx" ON "agent_tasks"("data_subject_request_id");
CREATE UNIQUE INDEX "data_systems_organization_id_agent_id_external_id_key" ON "data_systems"("organization_id", "agent_id", "external_id");
CREATE INDEX "data_systems_organization_id_system_type_idx" ON "data_systems"("organization_id", "system_type");
CREATE UNIQUE INDEX "data_fields_system_id_external_id_key" ON "data_fields"("system_id", "external_id");
CREATE INDEX "data_fields_organization_id_pii_idx" ON "data_fields"("organization_id", "pii");
CREATE INDEX "data_fields_data_asset_id_idx" ON "data_fields"("data_asset_id");
CREATE UNIQUE INDEX "catalog_revisions_agent_id_revision_key" ON "catalog_revisions"("agent_id", "revision");
CREATE UNIQUE INDEX "catalog_revisions_agent_id_report_hash_key" ON "catalog_revisions"("agent_id", "report_hash");
CREATE INDEX "catalog_revisions_organization_id_received_at_idx" ON "catalog_revisions"("organization_id", "received_at");
CREATE UNIQUE INDEX "identity_graph_edges_organization_id_system_id_source_identity_hash_target_identity_hash_edge_type_key" ON "identity_graph_edges"("organization_id", "system_id", "source_identity_hash", "target_identity_hash", "edge_type");
CREATE INDEX "identity_graph_edges_organization_id_source_identity_hash_idx" ON "identity_graph_edges"("organization_id", "source_identity_hash");
CREATE INDEX "identity_graph_edges_organization_id_target_identity_hash_idx" ON "identity_graph_edges"("organization_id", "target_identity_hash");
CREATE UNIQUE INDEX "compliance_findings_organization_id_dedupe_key_key" ON "compliance_findings"("organization_id", "dedupe_key");
CREATE INDEX "compliance_findings_organization_id_status_severity_idx" ON "compliance_findings"("organization_id", "status", "severity");
CREATE INDEX "compliance_findings_agent_id_idx" ON "compliance_findings"("agent_id");
CREATE INDEX "compliance_findings_system_id_idx" ON "compliance_findings"("system_id");
CREATE INDEX "compliance_findings_data_asset_id_idx" ON "compliance_findings"("data_asset_id");
CREATE UNIQUE INDEX "evidence_ledger_entries_organization_id_sequence_key" ON "evidence_ledger_entries"("organization_id", "sequence");
CREATE UNIQUE INDEX "evidence_ledger_entries_organization_id_entry_hash_key" ON "evidence_ledger_entries"("organization_id", "entry_hash");
CREATE INDEX "evidence_ledger_entries_organization_id_entity_type_entity_id_idx" ON "evidence_ledger_entries"("organization_id", "entity_type", "entity_id");
CREATE UNIQUE INDEX "plugins_organization_id_plugin_key_version_key" ON "plugins"("organization_id", "plugin_key", "version");
CREATE UNIQUE INDEX "plugins_global_plugin_key_version_key" ON "plugins"("plugin_key", "version") WHERE "organization_id" IS NULL;
CREATE INDEX "plugins_plugin_key_version_idx" ON "plugins"("plugin_key", "version");
CREATE UNIQUE INDEX "rulepacks_organization_id_rulepack_key_version_key" ON "rulepacks"("organization_id", "rulepack_key", "version");
CREATE UNIQUE INDEX "rulepacks_global_rulepack_key_version_key" ON "rulepacks"("rulepack_key", "version") WHERE "organization_id" IS NULL;
CREATE INDEX "rulepacks_rulepack_key_version_idx" ON "rulepacks"("rulepack_key", "version");
CREATE INDEX "data_assets_system_id_idx" ON "data_assets"("system_id");
CREATE INDEX "data_assets_agent_id_idx" ON "data_assets"("agent_id");
CREATE INDEX "violations_organization_id_finding_source_dedupe_key_idx" ON "violations"("organization_id", "finding_source", "dedupe_key");
CREATE INDEX "violations_compliance_finding_id_idx" ON "violations"("compliance_finding_id");
CREATE INDEX "violations_agent_id_idx" ON "violations"("agent_id");
CREATE INDEX "violations_assessment_id_idx" ON "violations"("assessment_id");
CREATE UNIQUE INDEX "erasure_checklist_items_agent_task_id_key" ON "erasure_checklist_items"("agent_task_id");

ALTER TABLE "organization_control_plane_settings" ADD CONSTRAINT "organization_control_plane_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_enrollment_tokens" ADD CONSTRAINT "agent_enrollment_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_enrollment_token_id_fkey" FOREIGN KEY ("enrollment_token_id") REFERENCES "agent_enrollment_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_certificates" ADD CONSTRAINT "agent_certificates_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_certificates" ADD CONSTRAINT "agent_certificates_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "agent_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_data_subject_request_id_fkey" FOREIGN KEY ("data_subject_request_id") REFERENCES "data_subject_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_systems" ADD CONSTRAINT "data_systems_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_systems" ADD CONSTRAINT "data_systems_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_fields" ADD CONSTRAINT "data_fields_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_fields" ADD CONSTRAINT "data_fields_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "data_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_fields" ADD CONSTRAINT "data_fields_data_asset_id_fkey" FOREIGN KEY ("data_asset_id") REFERENCES "data_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_graph_edges" ADD CONSTRAINT "identity_graph_edges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_graph_edges" ADD CONSTRAINT "identity_graph_edges_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "data_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "data_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_data_asset_id_fkey" FOREIGN KEY ("data_asset_id") REFERENCES "data_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_catalog_revision_id_fkey" FOREIGN KEY ("catalog_revision_id") REFERENCES "catalog_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_ledger_entries" ADD CONSTRAINT "evidence_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rulepacks" ADD CONSTRAINT "rulepacks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_assets" ADD CONSTRAINT "data_assets_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "data_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_assets" ADD CONSTRAINT "data_assets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "violations" ADD CONSTRAINT "violations_compliance_finding_id_fkey" FOREIGN KEY ("compliance_finding_id") REFERENCES "compliance_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "violations" ADD CONSTRAINT "violations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "violations" ADD CONSTRAINT "violations_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "erasure_checklist_items" ADD CONSTRAINT "erasure_checklist_items_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
