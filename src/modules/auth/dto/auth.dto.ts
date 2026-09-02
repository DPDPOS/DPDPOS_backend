import { z } from "zod";

export const signupDtoSchema = z
  .object({
    organizationName: z.string().trim().min(1).max(200),
    adminName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(200),
    industry: z.string().trim().min(1).max(120).optional(),
    companySize: z.string().trim().min(1).max(60).optional(),
    operatingRegion: z.string().trim().min(1).max(60).optional(),
    companyType: z.string().trim().min(1).max(60).optional(),
    maturityLevel: z.string().trim().min(1).max(60).optional(),
    isSignificantDataFiduciary: z.boolean().optional(),
  })
  .strict();

export const lookupOrganizationsDtoSchema = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

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

export const acceptInviteDtoSchema = z
  .object({
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(320),
    inviteToken: z.string().min(1),
    password: z.string().min(8).max(200),
  })
  .strict();

export const mfaConfirmDtoSchema = z
  .object({
    code: z.string().trim().min(6).max(8),
  })
  .strict();

export const mfaVerifyDtoSchema = z
  .object({
    mfaToken: z.string().min(1),
    code: z.string().trim().min(6).max(8),
  })
  .strict();

export const mfaResendDtoSchema = z
  .object({ mfaToken: z.string().min(1) })
  .strict();

export type SignupDto = z.infer<typeof signupDtoSchema>;
export type LookupOrganizationsDto = z.infer<typeof lookupOrganizationsDtoSchema>;
export type LoginDto = z.infer<typeof loginDtoSchema>;
export type RefreshDto = z.infer<typeof refreshDtoSchema>;
export type LogoutDto = z.infer<typeof logoutDtoSchema>;
export type AcceptInviteDto = z.infer<typeof acceptInviteDtoSchema>;
export type MfaConfirmDto = z.infer<typeof mfaConfirmDtoSchema>;
export type MfaVerifyDto = z.infer<typeof mfaVerifyDtoSchema>;
export type MfaResendDto = z.infer<typeof mfaResendDtoSchema>;
