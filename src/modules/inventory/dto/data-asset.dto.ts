import { z } from "zod";

export const createDataAssetDtoSchema = z.object({
  assetName: z.string().trim().min(1).max(255),

  assetType: z.string().trim().min(1).max(100),

  category: z.string().trim().min(1).max(100),

  sensitivity: z.enum([
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ]),

  description: z.string().trim().max(2000).optional(),

  storageLocation: z.string().trim().max(255).optional(),

  retentionPeriod: z.string().trim().max(255).optional(),

  departmentId: z.string().uuid().optional(),

  ownerUserId: z.string().uuid().optional(),
});

export type CreateDataAssetDto = z.infer<
  typeof createDataAssetDtoSchema
>;

export const updateDataAssetDtoSchema =
  createDataAssetDtoSchema.partial();

export type UpdateDataAssetDto = z.infer<
  typeof updateDataAssetDtoSchema
>;

export const dataAssetIdParamSchema = z.object({
  id: z.string().uuid(),
});