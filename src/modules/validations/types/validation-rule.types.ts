import type {
  RuleCategory,
  RuleSeverity,
} from "@prisma/client";

export type ValidationRuleRecord = {
  id: string;
  organizationId: string;

  ruleCode: string;
  title: string;
  description: string | null;
  legalBasisRef: string | null;
  severity: RuleSeverity;
  category: RuleCategory;
  activeFlag: boolean;
  version: number;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ValidationRuleResponse = {
  id: string;

  ruleCode: string;
  title: string;
  description: string | null;
  legalBasisRef: string | null;
  severity: string;
  category: string;
  activeFlag: boolean;
  version: number;

  createdAt: string;
  updatedAt: string;
};

export function toValidationRuleResponse(
  rule: ValidationRuleRecord,
): ValidationRuleResponse {
  return {
    id: rule.id,

    ruleCode: rule.ruleCode,
    title: rule.title,
    description: rule.description,
    legalBasisRef: rule.legalBasisRef,
    severity: rule.severity,
    category: rule.category,
    activeFlag: rule.activeFlag,
    version: rule.version,

    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
