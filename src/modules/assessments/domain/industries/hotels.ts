import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "hotels" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Hotels & Hospitality",
  stageOrder: 2,
} as const;

export const HOTELS_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-HTL-MODEL",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your hospitality operating model?",
    helpText:
      "Owned, managed, franchise, and OTA-heavy models change who is fiduciary vs processor for guest data.",
    valueType: "string",
    options: [
      "OWNED",
      "MANAGED",
      "FRANCHISE",
      "OTA_HEAVY",
      "SERVICED_APARTMENT",
      "OTHER",
    ],
    required: true,
  },
  {
    code: "Q-HTL-PMS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you run a PMS / CRS that stores guest profiles, ID proofs, and stay history?",
    helpText:
      "PMS data is core personal data — map access, retention, and vendor DPAs.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-ID-PROOF",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are government ID scans / passport copies collected at check-in retained only as long as required?",
    helpText:
      "ID copies are high-sensitivity; minimise retention after statutory / security holds end.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-OTA",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do OTAs / channel managers / payment gateways process guest data under contracts?",
    helpText:
      "Booking ecosystems are processor-heavy — inventory each channel.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-OTA-DPA",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are those channel / payment relationships covered by DPAs or equivalent privacy terms?",
    helpText: "Upload sample OTA/channel agreements under Vendor documents.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-HTL-OTA", equals: true },
  },
  {
    code: "Q-HTL-MARKETING",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is guest marketing (email/SMS/loyalty) only sent with purpose-specific consent / preferences?",
    helpText:
      "Stay confirmation is not blanket consent for promotional offers.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-CCTV",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is guest-area CCTV disclosed (notice) with purpose-limited retention?",
    helpText:
      "Lobby/corridor CCTV is personal data processing — post notice and define retention.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-CHILDREN",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you knowingly process children’s guest data (family rooms, kids clubs, school groups)?",
    helpText:
      "Child guest data may require parental consent and tighter marketing limits under Section 9.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-HTL-RIGHTS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Can you fulfil access / erasure across PMS, loyalty, and OTA-held copies?",
    helpText:
      "Guest rights workflows must reach channel partners, not only the front-desk profile.",
    valueType: "boolean",
    required: true,
  },
];
