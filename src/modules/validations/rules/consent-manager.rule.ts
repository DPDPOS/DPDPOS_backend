import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

const DIGITAL_CONSENT_SCALE_THRESHOLD = 50;

/**
 * Soft guidance when org processes digital consent at scale without an
 * external Consent Manager integration configured.
 */
export class ConsentManagerConfiguredRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "consent-manager-configured",
    title: "Consent Manager configured for digital consent at scale",
    description:
      "Organisations recording digital consent at scale should configure an external Consent Manager (or document NONE with compensating controls).",
    category: "CONSENT",
    severity: "MEDIUM",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const mode = input.organization.consentManagerMode ?? "NONE";
    const digitalConsentCount = input.consentRecords.filter(
      (c) => !c.deletedAt,
    ).length;

    if (mode === "EXTERNAL_CM") {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "External Consent Manager mode is configured.",
      };
    }

    if (digitalConsentCount < DIGITAL_CONSENT_SCALE_THRESHOLD) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: `Consent volume (${digitalConsentCount}) is below scale threshold; Consent Manager optional.`,
      };
    }

    return {
      status: "FAIL" as const,
      score: 40,
      explanation: `${digitalConsentCount} consent records with consentManagerMode=NONE. Configure EXTERNAL_CM (and URL) or document compensating controls for digital consent at scale.`,
    };
  }
}
