import { z } from "zod";

export const createProcessingActivityDtoSchema = z.object({
  dataAssetId: z.string().uuid(),

  purpose: z.string().trim().min(1).max(255),

  sourceSystem: z.string().trim().max(100).optional(),

  recipientType: z.string().trim().max(100).optional(),

  processorName: z.string().trim().max(255).optional(),

  vendorId: z.string().uuid().nullable().optional(),

  legalBasis: z.string().trim().max(255).optional(),

  retentionRule: z.string().trim().max(255).optional(),

  notes: z.string().trim().max(2000).optional(),
});

export type CreateProcessingActivityDto = z.infer<
  typeof createProcessingActivityDtoSchema
>;

export const updateProcessingActivityDtoSchema =
  createProcessingActivityDtoSchema.partial();

export type UpdateProcessingActivityDto = z.infer<
  typeof updateProcessingActivityDtoSchema
>;

export const processingActivityIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listProcessingActivitiesQuerySchema = z.object({
  dataAssetId: z.string().uuid().optional(),
});
