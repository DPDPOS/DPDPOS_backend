import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "education_edtech" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Education & EdTech",
  stageOrder: 2,
} as const;

export const EDUCATION_EDTECH_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-EDU-MODEL",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your education model?",
    helpText: "Schools vs consumer EdTech change who collects parental consent and how data is shared.",
    valueType: "string",
    options: ["SCHOOL", "UNIVERSITY", "EDTECH_B2C", "EDTECH_B2B", "COACHING", "OTHER"],
    required: true,
  },
  {
    code: "Q-EDU-UNDER18",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Are the majority of end users under 18?",
    helpText: "Child-majority platforms face the highest Section 9 operational burden.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-PARENTAL",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is verifiable parental/guardian consent obtained before processing children’s data?",
    helpText:
      "A checkbox saying “my parent agrees” is not enough — use a verifiable method.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-VERIFY-METHOD",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Which parental consent verification method do you use?",
    helpText:
      "Rules-oriented methods include DigiLocker tokens, government ID checks, or parent OTP.",
    valueType: "string",
    options: ["DIGILOCKER", "GOV_ID", "PARENT_OTP", "SCHOOL_ATTEST", "OTHER", "NONE"],
    required: true,
  },
  {
    code: "Q-EDU-NO-TRACK",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is tracking, behavioural monitoring, or targeted advertising disabled for child users?",
    helpText: "DPDP prohibits tracking and targeted ads directed at children.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-SCHOOL-SHARE",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is student data shared with schools, exam boards, or content partners under agreements?",
    helpText: "Cover each educational partner in your processor inventory and contracts.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-RETENTION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is student data deleted or anonymised after the course/cohort purpose ends (plus a lawful buffer)?",
    helpText: "Purpose fulfilment for education data should trigger erasure or anonymisation.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-ACCESS",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Can parents/guardians exercise access or erasure on behalf of the child?",
    helpText: "Rights UX for minors must work through a verified guardian channel.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-EDU-BIOMETRIC",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "Do you use biometric, proctoring, or facial data?",
    helpText: "Proctoring biometrics are high-sensitivity — minimise and justify clearly in notice.",
    valueType: "boolean",
    required: true,
  },
];
