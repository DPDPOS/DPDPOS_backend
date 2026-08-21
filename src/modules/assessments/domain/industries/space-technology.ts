import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "space_technology" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Space Technology",
  stageOrder: 2,
} as const;

export const SPACE_TECHNOLOGY_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-SPACE-SEGMENT",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your primary space / aerospace segment?",
    helpText:
      "Launch, satellite ops, ground stations, and defence-adjacent programmes create different personal-data and security constraints.",
    valueType: "string",
    options: [
      "LAUNCH",
      "SATELLITE_OPS",
      "GROUND_STATION",
      "DOWNSTREAM_APPS",
      "DEFENCE_ADJACENT",
      "OTHER",
    ],
    required: true,
  },
  {
    code: "Q-SPACE-WORKFORCE",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you process workforce / contractor data with elevated security clearances or biometrics?",
    helpText:
      "Aerospace HR and site-access systems often hold sensitive employee data — treat as high-risk fiduciary processing.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-GEO",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do products process geolocation or earth-observation data linkable to identifiable people / sites?",
    helpText:
      "Downstream EO/apps can become personal data when individuals or households are identifiable.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-CROSSBORDER",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is personal data transferred or accessed across borders (ground stations, cloud regions, partners)?",
    helpText:
      "Document cross-border transfers and partner access paths for DPDP transfer rules.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-PARTNERS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do international OEMs, agencies, or suppliers receive personal data under contracts?",
    helpText:
      "Supply-chain and agency partners need DPAs / equivalent terms when personal data is shared.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-PARTNER-DPA",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are those partner shares covered by DPAs or government/agency agreements with purpose limits?",
    helpText: "Upload sample partner/agency data-sharing terms under Vendor documents.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-SPACE-PARTNERS", equals: true },
  },
  {
    code: "Q-SPACE-EXPORT",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are export-control / national-security constraints separated from commercial personal-data use?",
    helpText:
      "Security classifications must not silently expand commercial secondary use of personal data.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-ACCESS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is privileged access to mission / ground systems logged and role-based for personal-data stores?",
    helpText:
      "Insider access to customer or workforce data in mission systems needs audit trails.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SPACE-BREACH",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Does your breach playbook cover dual reporting (Board / DPDP duties and any sector security obligations)?",
    helpText:
      "Aerospace incidents may trigger both privacy and security reporting paths — document owners and timelines.",
    valueType: "boolean",
    required: true,
  },
];
