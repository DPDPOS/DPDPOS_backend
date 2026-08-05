import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

/** Builds the org-scoped discovery snapshot consumed by every evaluator. */
export interface ValidationDataProvider {
  loadSnapshot(organizationId: string): Promise<RuleEvaluationInput>;
}
