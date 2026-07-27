import { z } from "zod";

export const controlStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "IMPLEMENTED",
  "VERIFIED",
]);

export const createControlDtoSchema = z
  .object({
    frameworkId: z.string().uuid(),
    code: z.string().trim().min(1).max(50),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    ownerUserId: z.string().uuid().optional(),
    dueAt: z.coerce.date().optional(),
    legalBasisRef: z.string().trim().max(200).optional(),
    status: controlStatusSchema.optional(),
  })
  .strict();

export const updateControlDtoSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    legalBasisRef: z.string().trim().max(200).nullable().optional(),
    status: controlStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    { message: "At least one field is required" },
  );

export const listControlsQuerySchema = z
  .object({
    frameworkId: z.string().uuid().optional(),
    status: controlStatusSchema.optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export const controlIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type CreateControlDto = z.infer<typeof createControlDtoSchema>;
export type UpdateControlDto = z.infer<typeof updateControlDtoSchema>;
export type ListControlsQuery = z.infer<typeof listControlsQuerySchema>;
