import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class NoticePresentRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "notice-present",
    title: "Notice is present",
    description:
      "The organization must have published at least one privacy notice covering its processing.",
    category: "NOTICE",
    severity: "MEDIUM",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const activeNotices = input.notices.filter((n) => !n.deletedAt);

    if (activeNotices.length === 0) {
      return {
        status: "FAIL" as const,
        score: 0,
        explanation:
          "No privacy notice has been published. Publish a notice covering the purposes in your processing activities.",
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `${activeNotices.length} published notice(s) found.`,
    };
  }
}
