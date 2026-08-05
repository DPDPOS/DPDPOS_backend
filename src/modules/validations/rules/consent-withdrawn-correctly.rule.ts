import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class ConsentWithdrawnCorrectlyRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "consent-withdrawn-correctly",
    title: "Consent withdrawal is recorded correctly",
    description:
      "Every withdrawn consent record must carry a withdrawal timestamp; processing must not continue on withdrawn consent.",
    category: "CONSENT",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const withdrawn = input.consentRecords.filter(
      (c) => c.consentState === "WITHDRAWN",
    );

    const missingTimestamp = withdrawn.filter((c) => !c.withdrawnAt);

    if (missingTimestamp.length > 0) {
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(
            ((withdrawn.length - missingTimestamp.length) / withdrawn.length) *
              100,
          ),
        ),
        explanation: `${missingTimestamp.length} withdrawn consent record(s) are missing a withdrawal timestamp. Record withdrawnAt to prove withdrawal.`,
        evidenceRequired: true,
      };
    }

    if (withdrawn.length > 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: `${withdrawn.length} withdrawal(s) recorded with timestamps.`,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: "No consent withdrawals recorded — nothing to verify.",
    };
  }
}
