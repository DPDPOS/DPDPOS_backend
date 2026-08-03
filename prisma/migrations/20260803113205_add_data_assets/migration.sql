-- CreateEnum
CREATE TYPE "DataAssetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "data_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "owner_user_id" UUID,
    "asset_name" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sensitivity" "DataSensitivity" NOT NULL,
    "description" TEXT,
    "storage_location" TEXT,
    "retention_period" TEXT,
    "status" "DataAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "data_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_assets_organization_id_idx" ON "data_assets"("organization_id");

-- CreateIndex
CREATE INDEX "data_assets_organization_id_status_idx" ON "data_assets"("organization_id", "status");

-- CreateIndex
CREATE INDEX "data_assets_department_id_idx" ON "data_assets"("department_id");

-- AddForeignKey
ALTER TABLE "data_assets" ADD CONSTRAINT "data_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_assets" ADD CONSTRAINT "data_assets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_assets" ADD CONSTRAINT "data_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
