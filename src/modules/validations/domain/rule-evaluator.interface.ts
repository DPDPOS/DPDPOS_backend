import type {
  RuleCategory,
  RuleSeverity,
  ValidationResultStatus,
} from "@prisma/client";

import type { RuleEvaluationInput } from "./rule-evaluation.types.js";

/** Static metadata a rule evaluator declares about itself. */
export type RuleDescriptor = {
  /** Stable machine code, joined to the validation_rules.rule_code column. */
  code: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
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
