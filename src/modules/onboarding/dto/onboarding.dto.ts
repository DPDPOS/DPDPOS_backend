import { z } from "zod";

export const onboardingAnswerItemSchema = z
  .object({
    questionCode: z.string().trim().min(1).max(120),
    value: z.union([z.boolean(), z.string(), z.number(), z.null()]),
  })
  .strict();

export const saveOnboardingAnswersDtoSchema = z
  .object({
    answers: z.array(onboardingAnswerItemSchema).min(1).max(200),
  })
  .strict();

export const onboardingProfileDtoSchema = z
  .object({
    industry: z.string().trim().min(1).max(120).optional(),
    companySize: z.string().trim().min(1).max(60).optional(),
    operatingRegion: z.string().trim().min(1).max(60).optional(),
    companyType: z.string().trim().min(1).max(60).optional(),
    maturityLevel: z.string().trim().min(1).max(60).optional(),
    isSignificantDataFiduciary: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required",
  });

export type SaveOnboardingAnswersDto = z.infer<
  typeof saveOnboardingAnswersDtoSchema
>;
export type OnboardingProfileDto = z.infer<typeof onboardingProfileDtoSchema>;

export const importOnboardingExcelSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255).optional(),
    contentBase64: z.string().min(32),
  })
  .strict();

export type ImportOnboardingExcelDto = z.infer<
  typeof importOnboardingExcelSchema
>;
