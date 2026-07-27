import { z } from "zod";

export const createDepartmentDtoSchema = z.object({
  name: z.string().min(1).max(200),
  headUserId: z.string().uuid().optional(),
});

export const updateDepartmentDtoSchema = createDepartmentDtoSchema.partial();

export type CreateDepartmentDto = z.infer<typeof createDepartmentDtoSchema>;
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentDtoSchema>;
