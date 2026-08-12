import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "telecom" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Telecom",
  stageOrder: 2,
} as const;

export const TELECOM_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-TEL-LICENSE",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What best describes your communications business?",
    helpText: "Licensed telcos/ISPs face TRAI and licensing overlays; OTT platforms differ.",
    valueType: "string",
    options: ["TELCO", "ISP", "OTT", "OTHER"],
    required: true,
  },
  {
    code: "Q-TEL-LOCATION",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you process precise location or mobility data?",
    helpText: "Location data is high-sensitivity — minimise collection and disclose purposes clearly.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-CDR",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you retain call or session detail records (CDRs / SDRs)?",
    helpText: "Map CDR retention to licensing/lawful requirements, then erase when holds end.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-LAWFUL",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is lawful interception / LEA disclosure separated from commercial use of subscriber data?",
    helpText: "Keep LEA processes purpose-limited and out of marketing/analytics pipelines.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-TRAI",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is commercial communication consent aligned with TRAI / preference frameworks?",
    helpText: "DND/preference compliance often overlaps marketing consent under DPDP.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-PARTNERS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you share subscriber data with content, OTT, or partner services under contracts?",
    helpText: "Partner ecosystems need DPAs and purpose limitation for each share.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-BREACH",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is your breach playbook sized for mass-subscriber incidents (comms + Board notification)?",
    helpText: "Telecom scale incidents need pre-drafted communications and regulator paths.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-SDF",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Given volume/sensitivity, have you formally assessed SDF likelihood?",
    helpText: "Large subscriber bases often push telecom entities toward SDF duties.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-TEL-CHILDREN",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you offer child-oriented plans or knowingly register minor subscribers?",
    helpText: "Minor subscribers trigger children’s-data consent and tracking restrictions.",
    valueType: "boolean",
    required: true,
  },
];
