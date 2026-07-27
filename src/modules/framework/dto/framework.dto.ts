import { z } from "zod";

export const generateFrameworkDtoSchema = z.object({
  industryProfile: z.string().optional(),
  maturityLevel: z.string().optional(),
  isSdf: z.boolean().optional(),
});

export type GenerateFrameworkDto = z.infer<typeof generateFrameworkDtoSchema>;
