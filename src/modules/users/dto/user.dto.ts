import { z } from "zod";

export const createUserDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  roleIds: z.array(z.string().uuid()).optional(),
  departmentId: z.string().uuid().optional(),
});

export const updateUserDtoSchema = createUserDtoSchema.partial();

export type CreateUserDto = z.infer<typeof createUserDtoSchema>;
export type UpdateUserDto = z.infer<typeof updateUserDtoSchema>;
