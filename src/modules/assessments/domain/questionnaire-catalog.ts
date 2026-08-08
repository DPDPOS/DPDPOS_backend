export type QuestionnaireQuestion = {
  code: string;
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  label: string;
  helpText: string;
  valueType: "boolean" | "string";
  options?: string[];
  required?: boolean;
  /** Conditional visibility based on a prior answer. */
  showIf?: { code: string; equals: string | boolean };
};

/**
 * Gap-assessment questionnaire aligned to DPDP operational readiness:
 * org profile → notice/consent → rights → vendors → retention/breach → governance.
 * Codes map into the assessment control engine where applicable.
 */
export const QUESTIONNAIRE_CATALOG: QuestionnaireQuestion[] = [
  // —— Stage 1: Organisation profile ——
  {
    code: "Q-BIZ-MODEL",
    stageId: "org_profile",
    stageLabel: "Organisation profile",
    stageOrder: 1,
    label: "Who do you primarily process personal data for?",
    helpText:
      "B2C means individuals (customers/users). B2B means other organisations. This shapes notice, consent and rights expectations under DPDP.",
    valueType: "string",
    options: ["B2C", "B2B", "BOTH"],
    required: true,
  },
  {
    code: "Q-DATA-VOLUME",
    stageId: "org_profile",
    stageLabel: "Organisation profile",
    stageOrder: 1,
    label: "Approximate scale of digital personal data you process",
    helpText:
      "Used for SDF readiness signalling (volume is one factor the Act contemplates for Significant Data Fiduciaries).",
    valueType: "string",
    options: ["UNDER_10K", "10K_TO_100K", "100K_TO_1M", "OVER_1M"],
    required: true,
  },
  {
    code: "Q-CHILDREN-DATA",
    stageId: "org_profile",
    stageLabel: "Organisation profile",
    stageOrder: 1,
    label: "Do you knowingly process personal data of children?",
    helpText:
      "Children’s data attracts stricter verifiable-consent and restriction duties under DPDP.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-CROSS-BORDER",
    stageId: "org_profile",
    stageLabel: "Organisation profile",
    stageOrder: 1,
    label: "Is personal data transferred or accessible outside India?",
    helpText:
      "Cross-border access affects transfer approvals and contractual safeguards with processors.",
    valueType: "boolean",
    required: true,
  },

  // —— Stage 2: Notice & consent ——
  {
    code: "Q-NOTICE-PUBLISHED",
    stageId: "notice_consent",
    stageLabel: "Notice & consent",
    stageOrder: 2,
    label: "Do you publish a privacy notice before collecting personal data?",
    helpText:
      "Upload your live privacy notice under Documents (type: Privacy notice). DPDP requires clear notice of purpose and rights.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-CONSENT-COLLECT",
    stageId: "notice_consent",
    stageLabel: "Notice & consent",
    stageOrder: 2,
    label: "Where consent is the basis, is it collected before processing starts?",
    helpText:
      "Consent must be free, specific, informed, unconditional and clear. Prefer purpose-linked consent records over bundled T&Cs.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-CONSENT-WITHDRAW",
    stageId: "notice_consent",
    stageLabel: "Notice & consent",
    stageOrder: 2,
    label: "Can a Data Principal withdraw consent as easily as they gave it?",
    helpText:
      "Withdrawal must be as easy as giving consent. Upload consent procedures and ensure CLI can find a withdraw endpoint/workflow.",
    valueType: "boolean",
    required: true,
  },

  // —— Stage 3: Rights ——
  {
    code: "Q-RIGHTS-ACCESS",
    stageId: "rights",
    stageLabel: "Data Principal rights",
    stageOrder: 3,
    label: "Can individuals request access to their personal data?",
    helpText:
      "Access requests need a tracked channel and response process. Upload your rights SOP if you have one.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-RIGHTS-CORRECT",
    stageId: "rights",
    stageLabel: "Data Principal rights",
    stageOrder: 3,
    label: "Can individuals request correction of inaccurate personal data?",
    helpText: "Correction is a core Data Principal right under DPDP.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-RIGHTS-DELETE",
    stageId: "rights",
    stageLabel: "Data Principal rights",
    stageOrder: 3,
    label: "Can individuals request erasure of their personal data?",
    helpText:
      "Erasure (with lawful exceptions) should be operational, not email-only. CLI looks for deletion/erasure endpoints as technical evidence.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-GRIEVANCE",
    stageId: "rights",
    stageLabel: "Data Principal rights",
    stageOrder: 3,
    label: "Is a grievance redressal contact / process published?",
    helpText:
      "DPDP requires a readily available means to raise grievances, with timelines for response.",
    valueType: "boolean",
    required: true,
  },

  // —— Stage 4: Vendors ——
  {
    code: "Q-VENDORS",
    stageId: "vendors",
    stageLabel: "Vendors & processors",
    stageOrder: 4,
    label: "Do you use vendors or other processors for personal data?",
    helpText:
      "Data Fiduciaries remain accountable for processors. If yes, you will be asked about DPAs.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-DPA",
    stageId: "vendors",
    stageLabel: "Vendors & processors",
    stageOrder: 4,
    label: "Do signed data processing agreements cover those processors?",
    helpText:
      "Upload sample DPAs under Documents (type: Vendor / processor DPA).",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-VENDORS", equals: true },
  },

  // —— Stage 5: Retention & breach ——
  {
    code: "Q-RETENTION",
    stageId: "retention_breach",
    stageLabel: "Retention & breach readiness",
    stageOrder: 5,
    label: "Is a retention schedule defined for personal data (and logs)?",
    helpText:
      "Upload your retention schedule. CLI also looks for retention settings in code/config.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BREACH-PROCESS",
    stageId: "retention_breach",
    stageLabel: "Retention & breach readiness",
    stageOrder: 5,
    label: "Do you have a documented personal-data breach response process?",
    helpText:
      "Cover detection, internal escalation, Board notification path, and affected-principal communication. Upload the incident/breach policy.",
    valueType: "boolean",
    required: true,
  },

  // —— Stage 6: Governance ——
  {
    code: "Q-PRIVACY-OWNER",
    stageId: "governance",
    stageLabel: "Governance",
    stageOrder: 6,
    label: "Is a named privacy / compliance owner accountable for DPDP?",
    helpText:
      "Accountability needs a human owner even if you are not an SDF.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TRAINING",
    stageId: "governance",
    stageLabel: "Governance",
    stageOrder: 6,
    label: "Do staff who handle personal data receive privacy training?",
    helpText: "Training reduces operational breach and rights-handling failures.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SDF",
    stageId: "governance",
    stageLabel: "Governance",
    stageOrder: 6,
    label: "Are you (or likely to be classified as) a Significant Data Fiduciary?",
    helpText:
      "SDFs face extra duties (DPO, audits, DPIA). Answer based on volume, sensitivity and risk — not a legal determination.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-DPO",
    stageId: "governance",
    stageLabel: "Governance",
    stageOrder: 6,
    label: "Have you appointed a Data Protection Officer?",
    helpText: "Required for SDFs; strongly recommended otherwise if scale is high.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-SDF", equals: true },
  },
];

export function listQuestionnaireStages(): Array<{
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  questionCodes: string[];
}> {
  const map = new Map<
    string,
    { stageId: string; stageLabel: string; stageOrder: number; questionCodes: string[] }
  >();
  for (const q of QUESTIONNAIRE_CATALOG) {
    const existing = map.get(q.stageId);
    if (existing) {
      existing.questionCodes.push(q.code);
    } else {
      map.set(q.stageId, {
        stageId: q.stageId,
        stageLabel: q.stageLabel,
        stageOrder: q.stageOrder,
        questionCodes: [q.code],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.stageOrder - b.stageOrder);
}
