-- CreateEnum
CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'COMPLETION', 'UPDATING', 'ERASURE', 'GRIEVANCE_REDRESSAL', 'NOMINATION');

-- CreateEnum
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESPONDED', 'REJECTED', 'CLOSED');

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_type" "DataSubjectRequestType" NOT NULL,
    "requester_reference" TEXT NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assigned_to" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "resolution_summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_subject_requests_organization_id_idx" ON "data_subject_requests"("organization_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_organization_id_status_idx" ON "data_subject_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "data_subject_requests_assigned_to_idx" ON "data_subject_requests"("assigned_to");

-- CreateIndex
CREATE INDEX "data_subject_requests_request_type_idx" ON "data_subject_requests"("request_type");

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
