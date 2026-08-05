-- CreateTable
CREATE TABLE "processing_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_asset_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "source_system" TEXT,
    "recipient_type" TEXT,
    "processor_name" TEXT,
    "legal_basis" TEXT,
    "retention_rule" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "processing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_activities_organization_id_idx" ON "processing_activities"("organization_id");

-- CreateIndex
CREATE INDEX "processing_activities_data_asset_id_idx" ON "processing_activities"("data_asset_id");

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_data_asset_id_fkey" FOREIGN KEY ("data_asset_id") REFERENCES "data_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
