/** Policy/artifact types orgs upload during gap assessment (DPDP operational docs). */
export const ASSESSMENT_DOCUMENT_TYPES = [
  "PRIVACY_NOTICE",
  "CONSENT_POLICY",
  "RETENTION_POLICY",
  "BREACH_POLICY",
  "RIGHTS_SOP",
  "VENDOR_DPA",
  "SECURITY_POLICY",
  "OTHER",
] as const;

export type AssessmentDocumentType = (typeof ASSESSMENT_DOCUMENT_TYPES)[number];

export const ASSESSMENT_DOCUMENT_TYPE_LABELS: Record<
  AssessmentDocumentType,
  string
> = {
  PRIVACY_NOTICE: "Privacy notice / privacy policy",
  CONSENT_POLICY: "Consent / notice procedure",
  RETENTION_POLICY: "Retention & deletion schedule",
  BREACH_POLICY: "Breach / incident response policy",
  RIGHTS_SOP: "Data principal rights SOP",
  VENDOR_DPA: "Vendor / processor DPA",
  SECURITY_POLICY: "Security safeguards policy",
  OTHER: "Other compliance document",
};

/** Document types that strengthen a control when present. */
export const DOCUMENT_TYPE_CONTROL_HINTS: Record<string, string[]> = {
  PRIVACY_NOTICE: ["DPDP-CONSENT-NOTICE", "DPDP-CONSENT-COLLECT"],
  CONSENT_POLICY: ["DPDP-CONSENT-COLLECT", "DPDP-CONSENT-WITHDRAW"],
  RETENTION_POLICY: ["DPDP-RETENTION-SCHEDULE", "DPDP-RETENTION-LOGS"],
  BREACH_POLICY: ["DPDP-BREACH-DETECT", "DPDP-BREACH-NOTIFY"],
  RIGHTS_SOP: [
    "DPDP-RIGHTS-ACCESS",
    "DPDP-RIGHTS-CORRECT",
    "DPDP-RIGHTS-ERASURE",
    "DPDP-RIGHTS-GRIEVANCE",
  ],
  VENDOR_DPA: ["DPDP-VENDOR-DPA", "DPDP-VENDOR-INVENTORY"],
  SECURITY_POLICY: ["DPDP-BREACH-DETECT"],
};
