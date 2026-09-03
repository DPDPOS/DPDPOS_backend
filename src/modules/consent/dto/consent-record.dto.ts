import { z } from "zod";

export const createConsentRecordDtoSchema = z
  .object({
    dataSubjectIdentifier: z.string().trim().min(1).max(500),

    noticeId: z.string().uuid().optional(),

    dataAssetId: z.string().uuid().optional(),

    /** Back-compat singular purpose. */
    purpose: z.string().trim().min(1).max(255).optional(),

    /** Preferred multi-purpose list. */
    purposes: z.array(z.string().trim().min(1).max(255)).min(1).max(20).optional(),

    grantedAt: z.string().datetime().optional(),

    expiresAt: z.string().datetime().nullable().optional(),

    proofFileId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.purpose?.trim()) || (v.purposes && v.purposes.length > 0), {
    message: "purpose or purposes is required",
    path: ["purpose"],
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
