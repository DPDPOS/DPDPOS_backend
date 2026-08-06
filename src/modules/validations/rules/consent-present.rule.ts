import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class ConsentPresentRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "consent-present",
    title: "Consent is present for personal data assets",
    description:
      "Every active data asset holding personal data should have at least one linked consent record.",
    category: "CONSENT",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const activeAssets = input.dataAssets.filter((a) => !a.deletedAt);

    if (activeAssets.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation:
          "No active data assets registered — nothing to consent for.",
      };
    }

    const consentedAssetIds = new Set(
      input.consentRecords
        .filter((c) => !c.deletedAt && c.dataAssetId)
        .map((c) => c.dataAssetId),
    );

    const assetsWithoutConsent = activeAssets.filter(
      (a) => !consentedAssetIds.has(a.id),
    );

    if (assetsWithoutConsent.length > 0) {
      const names = assetsWithoutConsent
        .slice(0, 5)
        .map((a) => `"${a.assetName}"`)
        .join(", ");
      const more =
        assetsWithoutConsent.length > 5
          ? ` and ${assetsWithoutConsent.length - 5} more`
          : "";
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(
            ((activeAssets.length - assetsWithoutConsent.length) /
              activeAssets.length) *
              100,
          ),
        ),
        explanation: `${assetsWithoutConsent.length} active asset(s) have no consent record: ${names}${more}. Record consent or confirm another legal basis.`,
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `All ${activeAssets.length} active data asset(s) have consent records.`,
    };
  }
}
