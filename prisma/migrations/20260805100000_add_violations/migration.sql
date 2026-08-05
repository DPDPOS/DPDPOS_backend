-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('OPEN', 'TRIAGE', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_EVIDENCE', 'VALIDATED', 'CLOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "violations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "validation_result_id" UUID,
    "severity" "RuleSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ViolationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "resolution_summary" TEXT,
    "evidence_required_flag" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "violations_organization_id_validation_result_id_key" ON "violations"("organization_id", "validation_result_id");

-- CreateIndex
CREATE INDEX "violations_organization_id_idx" ON "violations"("organization_id");

-- CreateIndex
CREATE INDEX "violations_organization_id_status_idx" ON "violations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "violations_assigned_to_idx" ON "violations"("assigned_to");

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_validation_result_id_fkey" FOREIGN KEY ("validation_result_id") REFERENCES "validation_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
