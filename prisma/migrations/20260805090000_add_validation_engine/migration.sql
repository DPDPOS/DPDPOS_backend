-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RuleCategory" AS ENUM ('NOTICE', 'CONSENT', 'RETENTION', 'RIGHTS');

-- CreateEnum
CREATE TYPE "ValidationTriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ValidationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ValidationResultStatus" AS ENUM ('PASS', 'FAIL', 'SKIPPED', 'ERROR');

-- CreateTable
CREATE TABLE "validation_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "legal_basis_ref" TEXT,
    "severity" "RuleSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" "RuleCategory" NOT NULL,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "validation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trigger_type" "ValidationTriggerType" NOT NULL,
    "triggered_by" UUID,
    "status" "ValidationRunStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "result_status" "ValidationResultStatus" NOT NULL,
    "explanation" TEXT,
    "score" INTEGER,
    "evidence_required_flag" BOOLEAN NOT NULL DEFAULT false,
    "control_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "validation_rules_organization_id_rule_code_key" ON "validation_rules"("organization_id", "rule_code");

-- CreateIndex
CREATE INDEX "validation_rules_organization_id_idx" ON "validation_rules"("organization_id");

-- CreateIndex
CREATE INDEX "validation_rules_organization_id_active_flag_idx" ON "validation_rules"("organization_id", "active_flag");

-- CreateIndex
CREATE INDEX "validation_runs_organization_id_idx" ON "validation_runs"("organization_id");

-- CreateIndex
CREATE INDEX "validation_runs_organization_id_status_idx" ON "validation_runs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "validation_results_run_id_rule_id_key" ON "validation_results"("run_id", "rule_id");

-- CreateIndex
CREATE INDEX "validation_results_organization_id_idx" ON "validation_results"("organization_id");

-- CreateIndex
CREATE INDEX "validation_results_run_id_idx" ON "validation_results"("run_id");

-- AddForeignKey
ALTER TABLE "validation_rules" ADD CONSTRAINT "validation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "validation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "validation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
