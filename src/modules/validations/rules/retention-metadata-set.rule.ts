import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class RetentionMetadataSetRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "retention-metadata-set",
    title: "Retention metadata is defined for data assets",
    description:
      "Every active data asset should define a retention period so that DPDP retention obligations can be enforced.",
    category: "RETENTION",
    severity: "MEDIUM",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const activeAssets = input.dataAssets.filter((a) => !a.deletedAt);

    if (activeAssets.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No active data assets registered.",
      };
    }

    const missingRetention = activeAssets.filter(
      (a) => !a.retentionPeriod?.trim(),
    );

    if (missingRetention.length > 0) {
      const names = missingRetention
        .slice(0, 5)
        .map((a) => `"${a.assetName}"`)
        .join(", ");
      const more =
        missingRetention.length > 5
          ? ` and ${missingRetention.length - 5} more`
          : "";
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(
            ((activeAssets.length - missingRetention.length) /
              activeAssets.length) *
              100,
          ),
        ),
        explanation: `${missingRetention.length} active asset(s) have no retention period: ${names}${more}. Define retention to comply with retention obligations.`,
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `All ${activeAssets.length} active data asset(s) define a retention period.`,
    };
  }
}
