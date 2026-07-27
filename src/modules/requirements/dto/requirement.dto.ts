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

export type CreateRequirementDto = z.infer<typeof createRequirementDtoSchema>;
export type MapRequirementDto = z.infer<typeof mapRequirementDtoSchema>;
export type ListRequirementsQuery = z.infer<typeof listRequirementsQuerySchema>;
