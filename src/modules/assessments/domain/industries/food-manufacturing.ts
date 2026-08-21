import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "food_manufacturing" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Food Manufacturing",
  stageOrder: 2,
} as const;

export const FOOD_MANUFACTURING_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-FOOD-OPS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What best describes your food operations?",
    helpText:
      "Manufacturing, processing, cold-chain, and B2B distribution each create different personal-data touchpoints (workers, buyers, logistics).",
    valueType: "string",
    options: [
      "MANUFACTURING",
      "PROCESSING",
      "COLD_CHAIN",
      "B2B_DISTRIBUTION",
      "PRIVATE_LABEL",
      "OTHER",
    ],
    required: true,
  },
  {
    code: "Q-FOOD-WORKFORCE",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you process plant / contract-worker data (attendance, biometrics, contractor rolls)?",
    helpText:
      "Factory HR and contractor data are fiduciary processing — often overlooked vs customer CRM.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-FOOD-BIOMETRIC",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is biometric attendance or access control used at plants / warehouses?",
    helpText:
      "Biometric workforce systems need notice, purpose limits, and strong access controls.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-FOOD-WORKFORCE", equals: true },
  },
  {
    code: "Q-FOOD-TRACEABILITY",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Does food-safety / recall traceability link batches to customer or distributor identities?",
    helpText:
      "Traceability is legitimate; still minimise personal data and define post-recall retention.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-FOOD-QA-LABS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do external labs, auditors, or certification bodies receive personal data under contracts?",
    helpText:
      "QA and certification partners are processors when they handle identifiable contacts or samples linked to people.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-FOOD-QA-DPA",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Are those lab / auditor relationships covered by DPAs or equivalent terms?",
    helpText: "Upload sample lab/auditor agreements under Vendor documents.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-FOOD-QA-LABS", equals: true },
  },
  {
    code: "Q-FOOD-LOGISTICS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do logistics / cold-chain partners receive delivery contact details under purpose limits?",
    helpText:
      "Distributors and transporters often see phone/address — inventory each hop.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-FOOD-CCTV",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is plant / warehouse CCTV notice posted and retention limited to security purposes?",
    helpText:
      "Workplace CCTV is personal data processing — publish notice and a retention schedule.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-FOOD-RETENTION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is retention mapped for quality records, complaints, and buyer contacts (then erasure)?",
    helpText:
      "Food-safety record holds and marketing contacts must not share one indefinite retention bucket.",
    valueType: "boolean",
    required: true,
  },
];
