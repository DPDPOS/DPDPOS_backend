import { z } from "zod";

export const createOrganizationDtoSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  operatingRegion: z.string().optional(),
  companyType: z.string().optional(),
  maturityLevel: z.string().optional(),
  isSignificantDataFiduciary: z.boolean().optional(),
});

export const updateOrganizationDtoSchema = createOrganizationDtoSchema.partial();

export type CreateOrganizationDto = z.infer<typeof createOrganizationDtoSchema>;
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationDtoSchema>;
