import { z } from "zod";

export const createRequirementDtoSchema = z.object({
  frameworkId: z.string().uuid(),
  controlId: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  legalBasisRef: z.string().optional(),
});

export type CreateRequirementDto = z.infer<typeof createRequirementDtoSchema>;
