import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class VendorDpaPresentRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "vendor-dpa-present",
    title: "Active vendors have a data processing agreement",
    description:
      "Every ACTIVE vendor/processor that handles personal data should have an ACTIVE DPA on file.",
    category: "VENDOR",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const vendors = input.vendors ?? [];
    const active = vendors.filter((v) => v.status === "ACTIVE");
    if (active.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No ACTIVE vendors registered.",
      };
    }

    const missing = active.filter((v) => !v.hasActiveDpa);
    if (missing.length > 0) {
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(((active.length - missing.length) / active.length) * 100),
        ),
        explanation: `${missing.length} ACTIVE vendor(s) lack an ACTIVE DPA.`,
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `All ${active.length} ACTIVE vendor(s) have an ACTIVE DPA.`,
    };
  }
}

export class VendorReviewCurrentRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "vendor-review-current",
    title: "Active vendors have a current diligence review",
    description:
      "ACTIVE vendors should have a completed diligence review (APPROVED or CONDITIONAL).",
    category: "VENDOR",
    severity: "MEDIUM",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const vendors = input.vendors ?? [];
    const active = vendors.filter((v) => v.status === "ACTIVE");
    if (active.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No ACTIVE vendors registered.",
      };
    }

    const stale = active.filter(
      (v) =>
        !v.latestReviewOutcome ||
        v.latestReviewOutcome === "PENDING" ||
        v.latestReviewOutcome === "REJECTED",
    );
    if (stale.length > 0) {
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(((active.length - stale.length) / active.length) * 100),
        ),
        explanation: `${stale.length} ACTIVE vendor(s) lack a completed diligence review.`,
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `All ${active.length} ACTIVE vendor(s) have a completed diligence review.`,
    };
  }
}
