import { z } from "zod";

export const createRoleDtoSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

export const updateRolePermissionsDtoSchema = z.object({
  permissions: z.array(z.string()).min(1),
});

export type CreateRoleDto = z.infer<typeof createRoleDtoSchema>;
export type UpdateRolePermissionsDto = z.infer<typeof updateRolePermissionsDtoSchema>;
