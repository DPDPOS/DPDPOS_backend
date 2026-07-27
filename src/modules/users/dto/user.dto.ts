import { z } from "zod";

export const createUserDtoSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(200),
    roleIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

export const updateUserDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["ACTIVE", "INVITED", "DISABLED"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const userIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  })
  .strict();

export type CreateUserDto = z.infer<typeof createUserDtoSchema>;
export type UpdateUserDto = z.infer<typeof updateUserDtoSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
