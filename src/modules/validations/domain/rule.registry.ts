import type { ValidationRuleEvaluator } from "./rule-evaluator.interface.js";

import { NoticePresentRule } from "../rules/notice-present.rule.js";
import { ConsentPresentRule } from "../rules/consent-present.rule.js";
import { ConsentWithdrawnCorrectlyRule } from "../rules/consent-withdrawn-correctly.rule.js";
import { RetentionMetadataSetRule } from "../rules/retention-metadata-set.rule.js";
import { RequestRespondedWithinSlaRule } from "../rules/request-responded-within-sla.rule.js";
import {
  VendorDpaPresentRule,
  VendorReviewCurrentRule,
} from "../rules/vendor-rules.js";

const EVALUATORS: ValidationRuleEvaluator[] = [
  new NoticePresentRule(),
  new ConsentPresentRule(),
  new ConsentWithdrawnCorrectlyRule(),
  new RetentionMetadataSetRule(),
  new RequestRespondedWithinSlaRule(),
  new VendorDpaPresentRule(),
  new VendorReviewCurrentRule(),
];

const BY_CODE = new Map(
  EVALUATORS.map((e) => [e.descriptor.code, e] as const),
);

/** Resolves the executable evaluator for a rule code, or null. */
export function resolveEvaluator(
  ruleCode: string,
): ValidationRuleEvaluator | null {
  return BY_CODE.get(ruleCode) ?? null;
}

/** All registered evaluator descriptors — used to seed per-org rules. */
export function defaultRuleDescriptors() {
  return EVALUATORS.map((e) => e.descriptor);
}

export { EVALUATORS as REGISTERED_EVALUATORS };
