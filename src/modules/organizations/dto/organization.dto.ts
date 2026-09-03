import { z } from "zod";

export const createOrganizationDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    industry: z.string().trim().min(1).max(120).optional(),
    companySize: z.string().trim().min(1).max(60).optional(),
    operatingRegion: z.string().trim().min(1).max(60).optional(),
    companyType: z.string().trim().min(1).max(60).optional(),
    maturityLevel: z.string().trim().min(1).max(60).optional(),
    isSignificantDataFiduciary: z.boolean().optional(),
  })
  .strict();

export const updateOrganizationDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    industry: z.string().trim().min(1).max(120).nullable().optional(),
    companySize: z.string().trim().min(1).max(60).nullable().optional(),
    operatingRegion: z.string().trim().min(1).max(60).nullable().optional(),
    companyType: z.string().trim().min(1).max(60).nullable().optional(),
    maturityLevel: z.string().trim().min(1).max(60).nullable().optional(),
    isSignificantDataFiduciary: z.boolean().optional(),
    consentManagerMode: z.enum(["NONE", "EXTERNAL_CM"]).optional(),
    consentManagerUrl: z.string().trim().url().max(2000).nullable().optional(),
    consentManagerWebhookSecret: z.string().trim().min(8).max(200).nullable().optional(),
    dsrRoutingJson: z.record(z.string(), z.string().uuid()).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const organizationIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type CreateOrganizationDto = z.infer<typeof createOrganizationDtoSchema>;
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationDtoSchema>;
