import { z } from "zod";

export const createDepartmentDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    headUserId: z.string().uuid().optional(),
  })
  .strict();

export const listDepartmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export type CreateDepartmentDto = z.infer<typeof createDepartmentDtoSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
