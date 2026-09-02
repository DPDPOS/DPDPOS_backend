import type { RoadmapPhase } from "../../framework/domain/templates.js";

export type NistPrivacyFunction =
  | "Identify-P"
  | "Govern-P"
  | "Control-P"
  | "Communicate-P"
  | "Protect-P";

export type RegulatoryDeadline = {
  label: string;
  date: string;
};

export type ControlCatalogEntry = {
  frameworkCode: string;
  assessmentCodes: readonly string[];
  requirementCodes: readonly string[];
  phase: RoadmapPhase;
  regulatoryDeadlines?: readonly RegulatoryDeadline[];
  nistFunctions?: readonly NistPrivacyFunction[];
  dependsOn?: readonly string[];
  sdfOverlay?: boolean;
};

/** Single source of truth mapping framework, assessment, and obligation codes. */
export const CONTROL_CATALOG: readonly ControlCatalogEntry[] = [
  {
    frameworkCode: "CTRL-NOTICE",
    assessmentCodes: ["DPDP-CONSENT-NOTICE"],
    requirementCodes: ["REQ-NOTICE-01"],
    phase: "Foundation",
    nistFunctions: ["Communicate-P"],
  },
  {
    frameworkCode: "CTRL-CONSENT",
    assessmentCodes: ["DPDP-CONSENT-COLLECT", "DPDP-CONSENT-WITHDRAW"],
    requirementCodes: ["REQ-CONSENT-01", "REQ-CONSENT-02"],
    phase: "Foundation",
    nistFunctions: ["Control-P"],
    dependsOn: ["CTRL-NOTICE"],
  },
  {
    frameworkCode: "CTRL-CONSENT-MGR",
    assessmentCodes: ["DPDP-CONSENT-MGR"],
    requirementCodes: ["REQ-CONSENT-MGR-01"],
    phase: "Foundation",
    nistFunctions: ["Control-P"],
    dependsOn: ["CTRL-CONSENT"],
    regulatoryDeadlines: [
      { label: "Consent Manager registration", date: "2026-11-14" },
    ],
  },
  {
    frameworkCode: "CTRL-PURPOSE",
    assessmentCodes: [],
    requirementCodes: ["REQ-PURPOSE-01"],
    phase: "Foundation",
    nistFunctions: ["Control-P"],
  },
  {
    frameworkCode: "CTRL-INVENTORY",
    assessmentCodes: [],
    requirementCodes: ["REQ-INVENTORY-01"],
    phase: "Foundation",
    nistFunctions: ["Identify-P"],
  },
  {
    frameworkCode: "CTRL-SECURITY",
    assessmentCodes: [],
    requirementCodes: ["REQ-SECURITY-01"],
    phase: "Operations",
    nistFunctions: ["Protect-P"],
  },
  {
    frameworkCode: "CTRL-BREACH",
    assessmentCodes: ["DPDP-BREACH-DETECT", "DPDP-BREACH-NOTIFY"],
    requirementCodes: ["REQ-BREACH-01", "REQ-BREACH-02"],
    phase: "Operations",
    nistFunctions: ["Protect-P"],
    dependsOn: ["CTRL-SECURITY"],
  },
  {
    frameworkCode: "CTRL-RETENTION",
    assessmentCodes: ["DPDP-RETENTION-SCHEDULE", "DPDP-RETENTION-LOGS"],
    requirementCodes: ["REQ-RETENTION-01"],
    phase: "Operations",
    nistFunctions: ["Control-P"],
  },
  {
    frameworkCode: "CTRL-AUTO-DELETE",
    assessmentCodes: ["DPDP-AUTO-DELETE"],
    requirementCodes: ["REQ-AUTO-DELETE-01"],
    phase: "Operations",
    nistFunctions: ["Control-P"],
    dependsOn: ["CTRL-RETENTION"],
  },
  {
    frameworkCode: "CTRL-RIGHTS",
    assessmentCodes: [
      "DPDP-RIGHTS-ACCESS",
      "DPDP-RIGHTS-CORRECT",
      "DPDP-RIGHTS-ERASURE",
      "DPDP-RIGHTS-GRIEVANCE",
    ],
    requirementCodes: ["REQ-RIGHTS-01", "REQ-RIGHTS-SLA-01"],
    phase: "Operations",
    nistFunctions: ["Control-P"],
  },
  {
    frameworkCode: "CTRL-GRIEVANCE",
    assessmentCodes: ["DPDP-GRIEVANCE-OFFICER", "DPDP-RIGHTS-GRIEVANCE"],
    requirementCodes: ["REQ-GRIEVANCE-01"],
    phase: "Operations",
    nistFunctions: ["Communicate-P"],
    dependsOn: ["CTRL-RIGHTS"],
  },
  {
    frameworkCode: "CTRL-CHILDREN",
    assessmentCodes: [],
    requirementCodes: ["REQ-CHILDREN-01"],
    phase: "Operations",
    nistFunctions: ["Control-P"],
  },
  {
    frameworkCode: "CTRL-PROCESSOR",
    assessmentCodes: ["DPDP-VENDOR-INVENTORY", "DPDP-VENDOR-DPA"],
    requirementCodes: ["REQ-PROCESSOR-01"],
    phase: "Operations",
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-TRANSFER",
    assessmentCodes: [],
    requirementCodes: ["REQ-TRANSFER-01"],
    phase: "Operations",
    nistFunctions: ["Control-P"],
  },
  {
    frameworkCode: "CTRL-TRAINING",
    assessmentCodes: ["DPDP-GOV-TRAINING"],
    requirementCodes: ["REQ-TRAINING-01"],
    phase: "Governance",
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-SDF-DPO",
    assessmentCodes: ["DPDP-SDF-DPO"],
    requirementCodes: ["REQ-DPO-01"],
    phase: "Foundation",
    sdfOverlay: true,
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-SDF-AUDIT",
    assessmentCodes: [],
    requirementCodes: ["REQ-AUDIT-01"],
    phase: "Governance",
    sdfOverlay: true,
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-SDF-DPIA",
    assessmentCodes: [],
    requirementCodes: ["REQ-DPIA-01"],
    phase: "Governance",
    sdfOverlay: true,
    nistFunctions: ["Govern-P"],
  },
  // NIST-aligned optional controls (Wave 4)
  {
    frameworkCode: "CTRL-DATA-FLOWS",
    assessmentCodes: [],
    requirementCodes: ["REQ-DATA-FLOWS-01"],
    phase: "Foundation",
    nistFunctions: ["Identify-P"],
    dependsOn: ["CTRL-INVENTORY"],
  },
  {
    frameworkCode: "CTRL-GOV-POLICY",
    assessmentCodes: ["DPDP-GOV-OWNER"],
    requirementCodes: ["REQ-GOV-POLICY-01"],
    phase: "Governance",
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-RISK-REGISTER",
    assessmentCodes: [],
    requirementCodes: ["REQ-RISK-REGISTER-01"],
    phase: "Governance",
    nistFunctions: ["Govern-P"],
  },
  {
    frameworkCode: "CTRL-PROCESSING-AWARENESS",
    assessmentCodes: [],
    requirementCodes: ["REQ-PROCESSING-AWARENESS-01"],
    phase: "Governance",
    nistFunctions: ["Communicate-P"],
  },
  {
    frameworkCode: "CTRL-AUTH-STANDARDS",
    assessmentCodes: [],
    requirementCodes: ["REQ-AUTH-STANDARDS-01"],
    phase: "Operations",
    nistFunctions: ["Protect-P"],
    dependsOn: ["CTRL-SECURITY"],
  },
  {
    frameworkCode: "CTRL-ACCESS-CONTROL",
    assessmentCodes: [],
    requirementCodes: ["REQ-ACCESS-CONTROL-01"],
    phase: "Operations",
    nistFunctions: ["Protect-P"],
    dependsOn: ["CTRL-SECURITY"],
  },
  {
    frameworkCode: "CTRL-ENCRYPTION",
    assessmentCodes: [],
    requirementCodes: ["REQ-ENCRYPTION-01"],
    phase: "Operations",
    nistFunctions: ["Protect-P"],
    dependsOn: ["CTRL-SECURITY"],
  },
] as const;

const byFrameworkCode = new Map(
  CONTROL_CATALOG.map((e) => [e.frameworkCode, e]),
);

const assessmentToFramework = new Map<string, string>();
for (const entry of CONTROL_CATALOG) {
  for (const code of entry.assessmentCodes) {
    assessmentToFramework.set(code, entry.frameworkCode);
  }
}

export function getCatalogEntry(
  frameworkCode: string,
): ControlCatalogEntry | undefined {
  return byFrameworkCode.get(frameworkCode);
}

export function resolveFrameworkCode(
  assessmentControlCode: string,
): string | null {
  return assessmentToFramework.get(assessmentControlCode) ?? null;
}

export function getAssessmentCodesForFramework(
  frameworkCode: string,
): readonly string[] {
  return getCatalogEntry(frameworkCode)?.assessmentCodes ?? [];
}

export function getDependencies(frameworkCode: string): readonly string[] {
  return getCatalogEntry(frameworkCode)?.dependsOn ?? [];
}
