import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "banking_finance" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Banking & Fintech",
  stageOrder: 2,
} as const;

export const BANKING_FINANCE_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-BFSI-SEGMENTS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Which primary segments do you serve?",
    helpText:
      "Segment shapes KYC intensity, retention mandates, and regulator overlap (RBI / payments).",
    valueType: "string",
    options: ["BANK", "NBFC", "PAYMENTS", "LENDING", "INSURTECH", "WEALTH", "OTHER"],
    required: true,
  },
  {
    code: "Q-BFSI-KYC",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you collect KYC / government ID for onboarding?",
    helpText:
      "KYC identifiers are high-sensitivity. Map retention to RBI rules and erasure exceptions.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-LOCALISATION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is payment / customer account data stored and processed in India as required by applicable RBI norms?",
    helpText:
      "Payment data localisation is a common RBI expectation — document residency and exceptions.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-FRAUD",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is fraud / AML monitoring disclosed as a purpose (or lawful use) in your notice?",
    helpText:
      "Fraud monitoring must not be a hidden purpose. Align notice language with actual monitoring.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-RETENTION-CONFLICT",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Have you mapped where RBI/SEBI retention mandates override or delay DPDP erasure?",
    helpText:
      "Sector retention often conflicts with erasure requests — document lawful hold periods.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-BREACH-REG",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Does your breach playbook include sector regulator notification (e.g. RBI) in addition to the DPDP Board?",
    helpText: "BFSI often faces dual/triple reporting (Board, CERT-In, RBI).",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-ACCOUNT-AGG",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you share data with account aggregators, credit bureaus, or payment partners under contracts?",
    helpText: "These partners are processors or joint arrangements — cover them in DPAs/inventory.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-CONSENT-UNBUNDLE",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Are marketing / cross-sell consents unbundled from account opening?",
    helpText:
      "Bundled marketing consent with KYC onboarding is a frequent DPDP consent-quality failure.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-BFSI-CHILDREN",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do any products knowingly onboard minors (e.g. student/minor accounts)?",
    helpText: "Minor accounts trigger children’s-data duties including verifiable guardian consent.",
    valueType: "boolean",
    required: true,
  },
];
