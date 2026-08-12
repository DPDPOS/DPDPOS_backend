import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "healthcare" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Healthcare",
  stageOrder: 2,
} as const;

export const HEALTHCARE_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-HLTH-SETTING",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your primary care / health setting?",
    helpText: "Setting drives clinical-record norms, consent UX, and sharing patterns.",
    valueType: "string",
    options: [
      "HOSPITAL",
      "CLINIC",
      "LAB",
      "HEALTH_APP",
      "TELEMEDICINE",
      "PHARMA",
      "OTHER",
    ],
    required: true,
  },
  {
    code: "Q-HLTH-RECORDS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you create or store electronic health / clinical records?",
    helpText: "Clinical records are high-sensitivity — expect stricter access and retention mapping.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-CONSENT-TX",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "For clinical treatment, is notice/consent adapted for care delivery (not only app signup)?",
    helpText:
      "Treatment contexts need patient-facing notice that matches how data is used in care workflows.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-RESEARCH",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is patient data used for research, analytics, or commercial secondary use?",
    helpText: "Secondary use beyond treatment usually needs separate consent or another lawful basis.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-RESEARCH-CONSENT",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is that secondary use covered by separate informed consent / a documented lawful basis?",
    helpText: "Upload research/consent SOPs under Documents when secondary use is enabled.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-HLTH-RESEARCH", equals: true },
  },
  {
    code: "Q-HLTH-ACCESS-CTRL",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you enforce role-based access and audit logs for clinical data?",
    helpText: "Unauthorised staff access is a leading healthcare breach pattern.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-SHARING",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you share data with labs, insurers, pharmacies, or cloud EHR vendors under DPAs?",
    helpText: "Health ecosystems are processor-heavy — inventory and contract each hop.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-RETENTION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is retention aligned to clinical / legal record-keeping requirements and erasure thereafter?",
    helpText: "Map medical retention mandates, then erase or anonymise when the hold ends.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HLTH-CHILDREN",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you treat or process children’s health data?",
    helpText:
      "Paediatric data may involve parental consent and, for treatment, sector-specific nuances under the Rules.",
    valueType: "boolean",
    required: true,
  },
];
