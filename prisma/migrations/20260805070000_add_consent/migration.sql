-- CreateEnum
CREATE TYPE "ConsentState" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3),
    "published_by" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_subject_identifier" TEXT NOT NULL,
    "notice_id" UUID,
    "data_asset_id" UUID,
    "purpose" TEXT NOT NULL,
    "consent_state" "ConsentState" NOT NULL DEFAULT 'GRANTED',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "proof_file_id" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notices_organization_id_title_version_key" ON "notices"("organization_id", "title", "version");

-- CreateIndex
CREATE INDEX "notices_organization_id_idx" ON "notices"("organization_id");

-- CreateIndex
CREATE INDEX "consent_records_organization_id_idx" ON "consent_records"("organization_id");

-- CreateIndex
CREATE INDEX "consent_records_data_subject_identifier_idx" ON "consent_records"("data_subject_identifier");

-- CreateIndex
CREATE INDEX "consent_records_notice_id_idx" ON "consent_records"("notice_id");

-- CreateIndex
CREATE INDEX "consent_records_data_asset_id_idx" ON "consent_records"("data_asset_id");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_data_asset_id_fkey" FOREIGN KEY ("data_asset_id") REFERENCES "data_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
