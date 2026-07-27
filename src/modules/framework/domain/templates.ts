/**
 * Static DPDP control / obligation templates used by framework generation.
 * Filters are applied in selectTemplatesForProfile — keep codes stable.
 */

export type MaturityLevel = "basic" | "intermediate" | "advanced";
export type DataSensitivity = "low" | "medium" | "high";
export type RoadmapPhase =
  | "Foundation"
  | "Operations"
  | "Oversight"
  | "Significant Fiduciary";

export type RequirementTemplate = {
  code: string;
  title: string;
  description: string;
  legalBasisRef: string;
};

export type ControlTemplate = {
  code: string;
  title: string;
  description: string;
  legalBasisRef: string;
  phase: RoadmapPhase;
  /** Days after generation when the control is due. */
  dueDaysFromGenerate: number;
  requirementCodes: readonly string[];
  /** Include for all profiles when true (default). */
  always?: boolean;
  requiresSdf?: boolean;
  minMaturity?: MaturityLevel;
  industries?: readonly string[];
  minDepartmentCount?: number;
  requiresProcessors?: boolean;
  minSensitivity?: DataSensitivity;
};

export type FrameworkProfile = {
  industryProfile: string;
  maturityLevel: MaturityLevel;
  dataSensitivity: DataSensitivity;
  departmentCount: number;
  processorCount: number;
  isSdf: boolean;
};

const MATURITY_RANK: Record<MaturityLevel, number> = {
  basic: 1,
  intermediate: 2,
  advanced: 3,
};

const SENSITIVITY_RANK: Record<DataSensitivity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export const REQUIREMENT_TEMPLATES: readonly RequirementTemplate[] = [
  {
    code: "REQ-NOTICE-01",
    title: "Privacy notice content",
    description: "Publish a notice covering purpose, rights, and contact details.",
    legalBasisRef: "DPDP Act 2023 s.5",
  },
  {
    code: "REQ-CONSENT-01",
    title: "Consent capture",
    description: "Obtain free, specific, informed, unconditional, and clear consent.",
    legalBasisRef: "DPDP Act 2023 s.6",
  },
  {
    code: "REQ-CONSENT-02",
    title: "Consent withdrawal",
    description: "Provide an easy means to withdraw consent comparable to giving it.",
    legalBasisRef: "DPDP Act 2023 s.6(4)",
  },
  {
    code: "REQ-PURPOSE-01",
    title: "Purpose limitation",
    description: "Process personal data only for the stated lawful purpose.",
    legalBasisRef: "DPDP Act 2023 s.4",
  },
  {
    code: "REQ-RETENTION-01",
    title: "Retention and erasure",
    description: "Erase personal data when the purpose is no longer served.",
    legalBasisRef: "DPDP Act 2023 s.8(7)",
  },
  {
    code: "REQ-SECURITY-01",
    title: "Security safeguards",
    description: "Implement reasonable security safeguards to prevent breaches.",
    legalBasisRef: "DPDP Act 2023 s.8(5)",
  },
  {
    code: "REQ-RIGHTS-01",
    title: "Data principal rights desk",
    description: "Enable access, correction, erasure, and grievance redressal requests.",
    legalBasisRef: "DPDP Act 2023 ss.11-13",
  },
  {
    code: "REQ-CHILDREN-01",
    title: "Children's data verifiable consent",
    description: "Obtain verifiable consent of parent/guardian before processing children's data.",
    legalBasisRef: "DPDP Act 2023 s.9",
  },
  {
    code: "REQ-PROCESSOR-01",
    title: "Processor contracts",
    description: "Bind processors by contract to process only as instructed.",
    legalBasisRef: "DPDP Act 2023 s.8(2)",
  },
  {
    code: "REQ-TRANSFER-01",
    title: "Cross-border transfer controls",
    description: "Restrict transfers to jurisdictions not prohibited by the Central Government.",
    legalBasisRef: "DPDP Act 2023 s.16",
  },
  {
    code: "REQ-DPO-01",
    title: "Significant Data Fiduciary DPO",
    description: "Appoint a Data Protection Officer based in India.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(a)",
  },
  {
    code: "REQ-AUDIT-01",
    title: "Independent data audit",
    description: "Engage an independent data auditor for periodic audits.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(b)",
  },
  {
    code: "REQ-DPIA-01",
    title: "Data protection impact assessment",
    description: "Carry out DPIA for high-risk processing activities.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(c)",
  },
  {
    code: "REQ-INVENTORY-01",
    title: "Processing activity register",
    description: "Maintain an inventory of personal data processing activities.",
    legalBasisRef: "DPDP Rules 2025 — record keeping",
  },
  {
    code: "REQ-TRAINING-01",
    title: "Workforce awareness",
    description: "Train staff who handle personal data on DPDP obligations.",
    legalBasisRef: "DPDP Act 2023 s.8 — accountability",
  },
] as const;

export const CONTROL_TEMPLATES: readonly ControlTemplate[] = [
  {
    code: "CTRL-NOTICE",
    title: "Privacy notice program",
    description: "Establish and maintain privacy notices for all collection points.",
    legalBasisRef: "DPDP Act 2023 s.5",
    phase: "Foundation",
    dueDaysFromGenerate: 30,
    requirementCodes: ["REQ-NOTICE-01"],
    always: true,
  },
  {
    code: "CTRL-CONSENT",
    title: "Consent management",
    description: "Operate consent capture, proof storage, and withdrawal workflows.",
    legalBasisRef: "DPDP Act 2023 s.6",
    phase: "Foundation",
    dueDaysFromGenerate: 45,
    requirementCodes: ["REQ-CONSENT-01", "REQ-CONSENT-02"],
    always: true,
  },
  {
    code: "CTRL-PURPOSE",
    title: "Purpose limitation controls",
    description: "Ensure processing stays within documented lawful purposes.",
    legalBasisRef: "DPDP Act 2023 s.4",
    phase: "Foundation",
    dueDaysFromGenerate: 30,
    requirementCodes: ["REQ-PURPOSE-01"],
    always: true,
  },
  {
    code: "CTRL-INVENTORY",
    title: "Personal data inventory",
    description: "Map assets, purposes, systems, and recipients across departments.",
    legalBasisRef: "DPDP Rules 2025 — record keeping",
    phase: "Foundation",
    dueDaysFromGenerate: 60,
    requirementCodes: ["REQ-INVENTORY-01"],
    always: true,
  },
  {
    code: "CTRL-SECURITY",
    title: "Security safeguards",
    description: "Apply access control, encryption, logging, and breach readiness.",
    legalBasisRef: "DPDP Act 2023 s.8(5)",
    phase: "Operations",
    dueDaysFromGenerate: 60,
    requirementCodes: ["REQ-SECURITY-01"],
    always: true,
  },
  {
    code: "CTRL-RETENTION",
    title: "Retention and erasure",
    description: "Define retention schedules and erasure workflows per purpose.",
    legalBasisRef: "DPDP Act 2023 s.8(7)",
    phase: "Operations",
    dueDaysFromGenerate: 75,
    requirementCodes: ["REQ-RETENTION-01"],
    always: true,
  },
  {
    code: "CTRL-RIGHTS",
    title: "Data principal rights desk",
    description: "Operate an SLA-tracked rights request intake and fulfillment process.",
    legalBasisRef: "DPDP Act 2023 ss.11-13",
    phase: "Operations",
    dueDaysFromGenerate: 45,
    requirementCodes: ["REQ-RIGHTS-01"],
    always: true,
  },
  {
    code: "CTRL-TRAINING",
    title: "Privacy awareness training",
    description: "Deliver role-based DPDP training and track completion.",
    legalBasisRef: "DPDP Act 2023 s.8 — accountability",
    phase: "Oversight",
    dueDaysFromGenerate: 90,
    requirementCodes: ["REQ-TRAINING-01"],
    minMaturity: "intermediate",
  },
  {
    code: "CTRL-CHILDREN",
    title: "Children's data protections",
    description: "Gate children's data processing behind verifiable parental consent.",
    legalBasisRef: "DPDP Act 2023 s.9",
    phase: "Operations",
    dueDaysFromGenerate: 60,
    requirementCodes: ["REQ-CHILDREN-01"],
    industries: ["education", "healthcare", "gaming", "social"],
    minSensitivity: "medium",
  },
  {
    code: "CTRL-PROCESSOR",
    title: "Processor oversight",
    description: "Contract, diligence, and monitor third-party processors.",
    legalBasisRef: "DPDP Act 2023 s.8(2)",
    phase: "Operations",
    dueDaysFromGenerate: 60,
    requirementCodes: ["REQ-PROCESSOR-01"],
    requiresProcessors: true,
  },
  {
    code: "CTRL-TRANSFER",
    title: "Cross-border transfer governance",
    description: "Assess and control transfers of personal data outside India.",
    legalBasisRef: "DPDP Act 2023 s.16",
    phase: "Oversight",
    dueDaysFromGenerate: 90,
    requirementCodes: ["REQ-TRANSFER-01"],
    minMaturity: "intermediate",
    minSensitivity: "high",
  },
  {
    code: "CTRL-SDF-DPO",
    title: "Appoint Data Protection Officer",
    description: "Designate an India-based DPO for Significant Data Fiduciary duties.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(a)",
    phase: "Significant Fiduciary",
    dueDaysFromGenerate: 30,
    requirementCodes: ["REQ-DPO-01"],
    requiresSdf: true,
  },
  {
    code: "CTRL-SDF-AUDIT",
    title: "Independent data audit",
    description: "Schedule and complete independent data protection audits.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(b)",
    phase: "Significant Fiduciary",
    dueDaysFromGenerate: 120,
    requirementCodes: ["REQ-AUDIT-01"],
    requiresSdf: true,
  },
  {
    code: "CTRL-SDF-DPIA",
    title: "DPIA for high-risk processing",
    description: "Perform and maintain DPIAs for high-risk activities.",
    legalBasisRef: "DPDP Act 2023 s.10(2)(c)",
    phase: "Significant Fiduciary",
    dueDaysFromGenerate: 90,
    requirementCodes: ["REQ-DPIA-01"],
    requiresSdf: true,
  },
] as const;

export type SelectedFrameworkTemplates = {
  controls: ControlTemplate[];
  requirements: RequirementTemplate[];
};

export function selectTemplatesForProfile(
  profile: FrameworkProfile,
): SelectedFrameworkTemplates {
  const industry = profile.industryProfile.trim().toLowerCase();
  const maturityRank = MATURITY_RANK[profile.maturityLevel];
  const sensitivityRank = SENSITIVITY_RANK[profile.dataSensitivity];

  const controls = CONTROL_TEMPLATES.filter((tpl) => {
    if (tpl.requiresSdf && !profile.isSdf) return false;
    if (tpl.requiresProcessors && profile.processorCount < 1) return false;
    if (
      tpl.minDepartmentCount !== undefined &&
      profile.departmentCount < tpl.minDepartmentCount
    ) {
      return false;
    }
    if (tpl.minMaturity && maturityRank < MATURITY_RANK[tpl.minMaturity]) {
      return false;
    }
    if (
      tpl.minSensitivity &&
      sensitivityRank < SENSITIVITY_RANK[tpl.minSensitivity]
    ) {
      return false;
    }
    if (tpl.industries && tpl.industries.length > 0) {
      const allowed = tpl.industries.map((i) => i.toLowerCase());
      if (!allowed.includes(industry)) return false;
    }
    return true;
  });

  const requirementCodes = new Set(
    controls.flatMap((c) => c.requirementCodes),
  );
  const requirements = REQUIREMENT_TEMPLATES.filter((r) =>
    requirementCodes.has(r.code),
  );

  return { controls, requirements };
}

export function buildRoadmapJson(input: {
  profile: FrameworkProfile;
  controls: Array<{
    code: string;
    title: string;
    phase: RoadmapPhase;
    dueAt: string;
  }>;
  requirementCount: number;
  generatedAt: string;
}): Record<string, unknown> {
  const phases = (
    [
      "Foundation",
      "Operations",
      "Oversight",
      "Significant Fiduciary",
    ] as const
  )
    .map((name) => ({
      name,
      controls: input.controls
        .filter((c) => c.phase === name)
        .map((c) => ({
          code: c.code,
          title: c.title,
          dueAt: c.dueAt,
        })),
    }))
    .filter((p) => p.controls.length > 0);

  return {
    generatedAt: input.generatedAt,
    profile: input.profile,
    summary: {
      controlCount: input.controls.length,
      requirementCount: input.requirementCount,
      isSdf: input.profile.isSdf,
      phaseCount: phases.length,
    },
    phases,
  };
}
