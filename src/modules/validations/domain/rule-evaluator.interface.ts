import type { ValidationResultStatus } from "@prisma/client";

import type { RuleEvaluationInput } from "./rule-evaluation.types.js";
import type { RULE_CATEGORIES, RULE_SEVERITIES } from "../dto/validation-rule.dto.js";

/** Static metadata a rule evaluator declares about itself. */
export type RuleDescriptor = {
  /** Stable machine code, joined to the validation_rules.rule_code column. */
  code: string;
  title: string;
  description: string;
  category: (typeof RULE_CATEGORIES)[number];
  severity: (typeof RULE_SEVERITIES)[number];
};

export type RuleEvaluationOutcome = {
  status: Extract<ValidationResultStatus, "PASS" | "FAIL">;
  explanation: string;
  /** 0-100; 100 = full pass. Optional for graded rules. */
  score?: number;
  /** True when remediation/closure needs supporting evidence. */
  evidenceRequired?: boolean;
  /** Optional framework control id for traceability. */
  controlId?: string;
  /** Optional affected entity used for cross-run violation deduplication. */
  entityType?: string;
  entityId?: string;
};

/**
 * A validation rule is the executable half of the hybrid rule model:
 * the validation_rules row supplies configuration metadata, this interface
 * supplies deterministic, unit-testable evaluation logic.
 */
export interface ValidationRuleEvaluator {
  readonly descriptor: RuleDescriptor;

  evaluate(input: RuleEvaluationInput): Promise<RuleEvaluationOutcome>;
}
