import { z } from "zod";

export const createRequirementDtoSchema = z
  .object({
    frameworkId: z.string().uuid(),
    controlId: z.string().uuid().optional(),
    code: z.string().trim().min(1).max(50),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    legalBasisRef: z.string().trim().max(200).optional(),
  })
  .strict();

export const mapRequirementDtoSchema = z
  .object({
    controlId: z.string().uuid(),
  })
  .strict();

export const listRequirementsQuerySchema = z
  .object({
    frameworkId: z.string().uuid().optional(),
    controlId: z.string().uuid().optional(),
    unmapped: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (typeof value === "boolean") return value;
        return value === "true";
      }),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export const requirementIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const updateRequirementDtoSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    legalBasisRef: z.string().trim().max(200).optional(),
    status: z
      .enum([
        "NOT_STARTED",
        "IN_PROGRESS",
        "SATISFIED",
        "VERIFIED",
        "NOT_APPLICABLE",
      ])
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .strict();

export type UpdateRequirementDto = z.infer<typeof updateRequirementDtoSchema>;
export type CreateRequirementDto = z.infer<typeof createRequirementDtoSchema>;
export type MapRequirementDto = z.infer<typeof mapRequirementDtoSchema>;
/** Query type for list — keep optional keys truly optional (zod transform makes output awkward). */
export type ListRequirementsQuery = {
  frameworkId?: string;
  controlId?: string;
  unmapped?: boolean;
  page?: number;
  pageSize?: number;
};
