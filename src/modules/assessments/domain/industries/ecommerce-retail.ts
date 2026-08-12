import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "ecommerce_retail" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — E-commerce & Retail",
  stageOrder: 2,
} as const;

export const ECOMMERCE_RETAIL_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-ECOM-MODEL",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your commerce model?",
    helpText: "Marketplaces add seller/processor complexity; D2C is simpler but still tracks behaviour.",
    valueType: "string",
    options: ["MARKETPLACE", "INVENTORY", "D2C", "OMNI", "OTHER"],
    required: true,
  },
  {
    code: "Q-ECOM-TRACKING",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you use cookies, SDKs, or behavioural tracking for ads or personalisation?",
    helpText: "Tracking needs purpose-specific notice/consent — not a silent analytics default.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-MARKETING",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is marketing (SMS/email/push) only sent with purpose-specific consent / a preference centre?",
    helpText: "Align with DPDP consent quality and commercial-communication preference norms.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-SELLERS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do marketplace sellers or delivery partners process buyer personal data?",
    helpText: "Logistics and sellers often receive name, phone, and address — treat as processors.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-SELLER-DPA",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do contractual privacy terms cover those sellers / delivery partners?",
    helpText: "Upload sample marketplace/logistics terms under Vendor DPA documents.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-ECOM-SELLERS", equals: true },
  },
  {
    code: "Q-ECOM-PAYMENTS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is payment data handled via PCI-aware gateways (not stored unnecessarily on your systems)?",
    helpText: "Minimisation: avoid storing full PAN/CVV; prefer tokenised gateway flows.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-RETENTION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is an inactive account / order-data deletion policy defined (with pre-erasure notice if you are a large platform)?",
    helpText:
      "Large e-commerce entities may face specific inactivity retention ceilings under the Rules.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-RETURNS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Does account deletion / erasure handle orders, wallets, and seller-held copies?",
    helpText: "Rights workflows must reach downstream copies, not only the login profile.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-ECOM-CHILDREN",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are products/services directed at children or do you knowingly sell to minors online?",
    helpText: "Child-directed commerce triggers Section 9 parental consent and tracking limits.",
    valueType: "boolean",
    required: true,
  },
];
