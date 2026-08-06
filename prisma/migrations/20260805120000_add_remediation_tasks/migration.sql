-- CreateEnum
CREATE TYPE "RemediationTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemediationTaskSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "remediation_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "violation_id" UUID NOT NULL,
    "source" "RemediationTaskSource" NOT NULL DEFAULT 'MANUAL',
    "task_title" TEXT NOT NULL,
    "task_description" TEXT,
    "status" "RemediationTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to" UUID,
    "due_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "closed_at" TIMESTAMP(3),
    "verification_notes" TEXT,
    "resolution_summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "remediation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remediation_tasks_organization_id_idx" ON "remediation_tasks"("organization_id");

-- CreateIndex
CREATE INDEX "remediation_tasks_organization_id_status_idx" ON "remediation_tasks"("organization_id", "status");

-- CreateIndex
CREATE INDEX "remediation_tasks_assigned_to_idx" ON "remediation_tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "remediation_tasks_violation_id_idx" ON "remediation_tasks"("violation_id");

-- Partial unique index: at most one AUTO task per violation — the idempotency
-- backstop for ViolationCreated event redelivery (P2002 is caught in the
-- service, mirroring the violations dedupe pattern).
-- Prisma schema cannot express partial indexes, so this lives only in SQL.
-- NOTE: `prisma migrate dev` may report drift against this index; apply via
-- `prisma migrate deploy` as CI does.
CREATE UNIQUE INDEX "remediation_tasks_one_auto_task_per_violation_idx"
    ON "remediation_tasks"("organization_id", "violation_id")
    WHERE "source" = 'AUTO';

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_violation_id_fkey" FOREIGN KEY ("violation_id") REFERENCES "violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
