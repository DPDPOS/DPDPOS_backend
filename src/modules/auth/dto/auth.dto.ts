import { z } from "zod";

export const loginDtoSchema = z
  .object({
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

export const refreshDtoSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const logoutDtoSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export type LoginDto = z.infer<typeof loginDtoSchema>;
export type RefreshDto = z.infer<typeof refreshDtoSchema>;
export type LogoutDto = z.infer<typeof logoutDtoSchema>;
