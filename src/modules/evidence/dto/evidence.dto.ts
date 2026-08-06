import { z } from "zod";

export const createEvidenceDtoSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  description: z.string().optional(),
  controlId: z.string().uuid().optional(),
  violationId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateEvidenceDto = z.infer<typeof createEvidenceDtoSchema>;

export const confirmUploadDtoSchema = z.object({
  fileHash: z.string(),
  fileSizeBytes: z.number(),
});
export type ConfirmUploadDto = z.infer<typeof confirmUploadDtoSchema>;

export const tagEvidenceDtoSchema = z.object({
  tags: z.array(z.string()),
  description: z.string().optional(),
});
export type TagEvidenceDto = z.infer<typeof tagEvidenceDtoSchema>;

export const mapEvidenceDtoSchema = z.object({
  controlId: z.string().uuid(),
});
export type MapEvidenceDto = z.infer<typeof mapEvidenceDtoSchema>;

export const evidenceIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type EvidenceIdParam = z.infer<typeof evidenceIdParamSchema>;

export const listEvidenceQuerySchema = z.object({
  status: z.enum(["UPLOADED", "TAGGED", "MAPPED", "UNDER_REVIEW", "APPROVED", "LOCKED"]).optional(),
  controlId: z.string().uuid().optional(),
  violationId: z.string().uuid().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
});
export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;

export const exportEvidenceDtoSchema = z.object({
  status: z.enum(["UPLOADED", "TAGGED", "MAPPED", "UNDER_REVIEW", "APPROVED", "LOCKED"]).optional(),
  controlId: z.string().uuid().optional(),
  violationId: z.string().uuid().optional(),
});
export type ExportEvidenceDto = z.infer<typeof exportEvidenceDtoSchema>;
