import { z } from "zod";

export const loginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshDtoSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutDtoSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginDtoSchema>;
export type RefreshDto = z.infer<typeof refreshDtoSchema>;
export type LogoutDto = z.infer<typeof logoutDtoSchema>;
