-- AlterTable
ALTER TABLE "assessment_documents" ADD COLUMN "document_type" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "assessment_documents" ADD COLUMN "mime_type" TEXT;
ALTER TABLE "assessment_documents" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "assessment_documents" ADD COLUMN "file_size_bytes" INTEGER;
ALTER TABLE "assessment_documents" ADD COLUMN "upload_status" TEXT NOT NULL DEFAULT 'READY';
