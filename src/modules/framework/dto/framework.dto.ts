import { z } from "zod";

export const maturityLevelSchema = z.enum(["basic", "intermediate", "advanced"]);
export const dataSensitivitySchema = z.enum(["low", "medium", "high"]);

export const generateFrameworkDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    industryProfile: z.string().trim().min(1).max(100),
    maturityLevel: maturityLevelSchema,
    dataSensitivity: dataSensitivitySchema.default("medium"),
    departmentCount: z.number().int().min(0).max(10_000).default(0),
    processorCount: z.number().int().min(0).max(10_000).default(0),
    isSdf: z.boolean().default(false),
    publish: z.boolean().default(false),
  })
  .strict();

export const publishFrameworkDtoSchema = z
  .object({
    frameworkId: z.string().uuid().optional(),
  })
  .strict();

export const roadmapQuerySchema = z
  .object({
    frameworkId: z.string().uuid().optional(),
  })
  .strict();

export type GenerateFrameworkDto = z.infer<typeof generateFrameworkDtoSchema>;
export type PublishFrameworkDto = z.infer<typeof publishFrameworkDtoSchema>;
export type RoadmapQuery = z.infer<typeof roadmapQuerySchema>;
