import { z } from "zod";

export const createRoleDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const updateRolePermissionsDtoSchema = z
  .object({
    permissions: z.array(z.string().min(1)),
  })
  .strict();

export const roleIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const listRolesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export type CreateRoleDto = z.infer<typeof createRoleDtoSchema>;
export type UpdateRolePermissionsDto = z.infer<typeof updateRolePermissionsDtoSchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
