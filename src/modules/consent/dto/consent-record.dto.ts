import { z } from "zod";

export const createConsentRecordDtoSchema = z.object({
  dataSubjectIdentifier: z.string().trim().min(1).max(500),

  noticeId: z.string().uuid().optional(),

  dataAssetId: z.string().uuid().optional(),

  purpose: z.string().trim().min(1).max(255),

  grantedAt: z.string().datetime().optional(),

  proofFileId: z.string().trim().max(255).optional(),
});

export type CreateConsentRecordDto = z.infer<
  typeof createConsentRecordDtoSchema
>;

export const consentRecordIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listConsentRecordsQuerySchema = z.object({
  dataAssetId: z.string().uuid().optional(),

  noticeId: z.string().uuid().optional(),

  consentState: z.enum(["GRANTED", "WITHDRAWN"]).optional(),

  dataSubjectIdentifier: z.string().trim().max(500).optional(),
});
