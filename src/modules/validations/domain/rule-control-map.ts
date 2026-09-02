/**
 * Maps validation rule codes → framework control codes so FAIL results
 * attach to the living control register.
 */
export const RULE_TO_FRAMEWORK_CONTROL: Record<string, string> = {
  "notice-present": "CTRL-NOTICE",
  "consent-present": "CTRL-CONSENT",
  "consent-withdrawn-correctly": "CTRL-CONSENT",
  "retention-metadata-set": "CTRL-RETENTION",
  "request-responded-within-sla": "CTRL-RIGHTS",
  "vendor-dpa-present": "CTRL-PROCESSOR",
  "vendor-review-current": "CTRL-PROCESSOR",
  "breach-notification-ready": "CTRL-BREACH",
  "encryption-safeguards": "CTRL-ENCRYPTION",
  "cross-border-transfer-controlled": "CTRL-TRANSFER",
  "children-data-protected": "CTRL-CHILDREN",
  "sdf-dpo-appointed": "CTRL-SDF-DPO",
  "purpose-limitation-documented": "CTRL-PURPOSE",
  "auto-deletion-enforced": "CTRL-AUTO-DELETE",
};

export function frameworkCodeForRule(ruleCode: string): string | null {
  return RULE_TO_FRAMEWORK_CONTROL[ruleCode] ?? null;
}
