import type { ValidationRuleEvaluator } from "./rule-evaluator.interface.js";

import { NoticePresentRule } from "../rules/notice-present.rule.js";
import { ConsentPresentRule } from "../rules/consent-present.rule.js";
import { ConsentWithdrawnCorrectlyRule } from "../rules/consent-withdrawn-correctly.rule.js";
import { ConsentManagerConfiguredRule } from "../rules/consent-manager.rule.js";
import { RetentionMetadataSetRule } from "../rules/retention-metadata-set.rule.js";
import { RequestRespondedWithinSlaRule } from "../rules/request-responded-within-sla.rule.js";
import {
  VendorDpaPresentRule,
  VendorReviewCurrentRule,
} from "../rules/vendor-rules.js";
import {
  AutoDeletionEnforcedRule,
  BreachNotificationReadyRule,
  ChildrenDataProtectedRule,
  CrossBorderTransferControlledRule,
  EncryptionSafeguardsRule,
  PurposeLimitationDocumentedRule,
  SdfDpoAppointedRule,
} from "../rules/dpdp-extended.rules.js";
import {
  AgentHealthRule,
  CatalogFreshnessRule,
  ConsentCacheFreshnessRule,
  DataFlowComplianceRule,
  DsrEscalatedRule,
  PiiWithoutBasisRule,
  UnmappedSystemRule,
} from "../rules/agent-control-plane.rules.js";

const EVALUATORS: ValidationRuleEvaluator[] = [
  new NoticePresentRule(),
  new ConsentPresentRule(),
  new ConsentWithdrawnCorrectlyRule(),
  new ConsentManagerConfiguredRule(),
  new RetentionMetadataSetRule(),
  new RequestRespondedWithinSlaRule(),
  new VendorDpaPresentRule(),
  new VendorReviewCurrentRule(),
  new BreachNotificationReadyRule(),
  new EncryptionSafeguardsRule(),
  new CrossBorderTransferControlledRule(),
  new ChildrenDataProtectedRule(),
  new SdfDpoAppointedRule(),
  new PurposeLimitationDocumentedRule(),
  new AutoDeletionEnforcedRule(),
  new UnmappedSystemRule(),
  new PiiWithoutBasisRule(),
  new CatalogFreshnessRule(),
  new AgentHealthRule(),
  new ConsentCacheFreshnessRule(),
  new DsrEscalatedRule(),
  new DataFlowComplianceRule(),
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
