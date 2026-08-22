-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('PROCESSOR', 'SUB_PROCESSOR', 'JOINT', 'OTHER');
CREATE TYPE "VendorCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'OFFBOARDED');
CREATE TYPE "VendorRelationshipType" AS ENUM ('SUB_PROCESSOR', 'AFFILIATE', 'RESELLER', 'OTHER');
CREATE TYPE "VendorAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "VendorDiligenceOutcome" AS ENUM ('APPROVED', 'CONDITIONAL', 'REJECTED', 'PENDING');
CREATE TYPE "ErasureChecklistStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'FAILED');

-- AlterEnum
ALTER TYPE "RuleCategory" ADD VALUE IF NOT EXISTS 'VENDOR';

-- AlterTable processing_activities
ALTER TABLE "processing_activities" ADD COLUMN IF NOT EXISTS "vendor_id" UUID;

-- AlterTable data_subject_requests
ALTER TABLE "data_subject_requests" ADD COLUMN IF NOT EXISTS "cooling_off_until" TIMESTAMP(3);
ALTER TABLE "data_subject_requests" ADD COLUMN IF NOT EXISTS "immediate_erase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "data_subject_requests" ADD COLUMN IF NOT EXISTS "soft_deleted_at" TIMESTAMP(3);
ALTER TABLE "data_subject_requests" ADD COLUMN IF NOT EXISTS "hard_deleted_at" TIMESTAMP(3);
ALTER TABLE "data_subject_requests" ADD COLUMN IF NOT EXISTS "erasure_evidence_json" JSONB;

-- CreateTable vendors
CREATE TABLE IF NOT EXISTS "vendors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "vendor_type" "VendorType" NOT NULL DEFAULT 'PROCESSOR',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT,
    "data_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criticality" "VendorCriticality" NOT NULL DEFAULT 'MEDIUM',
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "inherent_risk_score" INTEGER,
    "residual_risk_score" INTEGER,
    "next_review_at" TIMESTAMP(3),
    "owner_user_id" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_relationships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_vendor_id" UUID NOT NULL,
    "child_vendor_id" UUID NOT NULL,
    "relationship_type" "VendorRelationshipType" NOT NULL,
    "personal_data_flows" BOOLEAN NOT NULL DEFAULT true,
    "notification_required" BOOLEAN NOT NULL DEFAULT true,
    "acknowledged_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vendor_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_agreements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" "VendorAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "storage_key" TEXT,
    "evidence_file_id" UUID,
    "allows_sub_processors" BOOLEAN NOT NULL DEFAULT false,
    "cross_border_allowed" BOOLEAN NOT NULL DEFAULT false,
    "breach_notify_hours" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vendor_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_diligence_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "reviewer_user_id" UUID,
    "outcome" "VendorDiligenceOutcome" NOT NULL DEFAULT 'PENDING',
    "residual_risk" "VendorCriticality",
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "questionnaire_json" JSONB,
    "notes" TEXT,
    "evidence_file_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vendor_diligence_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "erasure_checklist_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_subject_request_id" UUID NOT NULL,
    "system_key" TEXT NOT NULL,
    "system_label" TEXT NOT NULL,
    "vendor_id" UUID,
    "status" "ErasureChecklistStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "erasure_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vendors_organization_id_idx" ON "vendors"("organization_id");
CREATE INDEX IF NOT EXISTS "vendors_organization_id_status_idx" ON "vendors"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "vendors_organization_id_criticality_idx" ON "vendors"("organization_id", "criticality");
CREATE INDEX IF NOT EXISTS "vendor_relationships_organization_id_idx" ON "vendor_relationships"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_relationships_parent_vendor_id_child_vendor_id_key" ON "vendor_relationships"("parent_vendor_id", "child_vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_agreements_organization_id_idx" ON "vendor_agreements"("organization_id");
CREATE INDEX IF NOT EXISTS "vendor_agreements_vendor_id_idx" ON "vendor_agreements"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_agreements_vendor_id_status_idx" ON "vendor_agreements"("vendor_id", "status");
CREATE INDEX IF NOT EXISTS "vendor_diligence_reviews_organization_id_idx" ON "vendor_diligence_reviews"("organization_id");
CREATE INDEX IF NOT EXISTS "vendor_diligence_reviews_vendor_id_idx" ON "vendor_diligence_reviews"("vendor_id");
CREATE INDEX IF NOT EXISTS "erasure_checklist_items_organization_id_idx" ON "erasure_checklist_items"("organization_id");
CREATE INDEX IF NOT EXISTS "erasure_checklist_items_data_subject_request_id_idx" ON "erasure_checklist_items"("data_subject_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "erasure_checklist_items_data_subject_request_id_system_key_key" ON "erasure_checklist_items"("data_subject_request_id", "system_key");
CREATE INDEX IF NOT EXISTS "processing_activities_vendor_id_idx" ON "processing_activities"("vendor_id");

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_relationships" ADD CONSTRAINT "vendor_relationships_parent_vendor_id_fkey" FOREIGN KEY ("parent_vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_relationships" ADD CONSTRAINT "vendor_relationships_child_vendor_id_fkey" FOREIGN KEY ("child_vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_diligence_reviews" ADD CONSTRAINT "vendor_diligence_reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erasure_checklist_items" ADD CONSTRAINT "erasure_checklist_items_data_subject_request_id_fkey" FOREIGN KEY ("data_subject_request_id") REFERENCES "data_subject_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erasure_checklist_items" ADD CONSTRAINT "erasure_checklist_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
