import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "it_saas" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — IT & SaaS",
  stageOrder: 2,
} as const;

export const IT_SAAS_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-SAAS-ROLE",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "For customer personal data in the product, are you usually a Processor or a Fiduciary?",
    helpText:
      "Most B2B SaaS acts as processor for customer tenants — but product analytics or accounts may make you a fiduciary.",
    valueType: "string",
    options: ["PROCESSOR", "FIDUCIARY", "MIXED"],
    required: true,
  },
  {
    code: "Q-SAAS-DPA-CUSTOMER",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you offer standard customer DPA / data processing terms?",
    helpText: "Enterprise buyers expect a signed DPA; upload a template under Documents.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-SUBPROCESSORS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you publish or disclose a sub-processor list with change notice?",
    helpText: "Sub-processor transparency is a core SaaS accountability expectation.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-RESIDENCY",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Can customers choose data residency, or do you document hosting regions (IN vs multi-region)?",
    helpText: "Cross-border hosting must be disclosed and contractually controlled.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-EMPLOYEE",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you process your own employees’ or applicants’ personal data (HR)?",
    helpText:
      "HR processing is a separate fiduciary role even when the product is B2B processor.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-SUPPORT",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Can support tooling fulfil access/erasure without retaining production copies indefinitely?",
    helpText: "Support snapshots and tickets often become shadow personal-data stores.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-LOGS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Are product/security log retention periods documented and minimised?",
    helpText: "Align log retention with security need and Rules oversight expectations.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-TRAINING-DATA",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Is customer personal data used to train ML models?",
    helpText: "Training on customer data is a secondary purpose that needs disclosure and control.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-SAAS-TRAINING-OPT",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "If yes — is ML training disclosed and controllable via customer contract/notice?",
    helpText: "Customers should be able to opt out or contractually forbid training use.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-SAAS-TRAINING-DATA", equals: true },
  },
];
