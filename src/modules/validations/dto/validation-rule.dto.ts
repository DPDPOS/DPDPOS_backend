import { z } from "zod";

export const RULE_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const RULE_CATEGORIES = [
  "NOTICE",
  "CONSENT",
  "RETENTION",
  "RIGHTS",
  "VENDOR",
  "SECURITY",
  "BREACH",
  "TRANSFER",
  "CHILDREN",
  "GOVERNANCE",
  "PURPOSE",
] as const;

export const createValidationRuleDtoSchema = z.object({
  ruleCode: z.string().trim().min(1).max(100),

  title: z.string().trim().min(1).max(255),

  description: z.string().trim().max(4000).optional(),

  legalBasisRef: z.string().trim().max(255).optional(),

  severity: z.enum(RULE_SEVERITIES).optional(),

  category: z.enum(RULE_CATEGORIES).optional(),
});

export type CreateValidationRuleDto = z.infer<
  typeof createValidationRuleDtoSchema
>;

export const updateValidationRuleDtoSchema = z
  .object({
    /** Expected current version — optimistic-lock token (mismatch → 409). */
    version: z.number().int().min(1),

    title: z.string().trim().min(1).max(255).optional(),

    description: z.string().trim().max(4000).nullable().optional(),

    legalBasisRef: z.string().trim().max(255).nullable().optional(),

    severity: z.enum(RULE_SEVERITIES).optional(),

    activeFlag: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.legalBasisRef !== undefined ||
      data.severity !== undefined ||
      data.activeFlag !== undefined,
    { message: "At least one field to update is required" },
  );

export type UpdateValidationRuleDto = z.infer<
  typeof updateValidationRuleDtoSchema
>;

export const validationRuleIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listValidationRulesQuerySchema = z.object({
  category: z.enum(RULE_CATEGORIES).optional(),

  activeOnly: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type ListValidationRulesQuery = z.infer<
  typeof listValidationRulesQuerySchema
>;
