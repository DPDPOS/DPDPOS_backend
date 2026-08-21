import type { QuestionnaireQuestion } from "../questionnaire-types.js";
import type { IndustryDomainKey } from "../industry-domains.js";

const DOMAIN = "automobile" as const satisfies IndustryDomainKey;
const STAGE = {
  stageId: "industry_context",
  stageLabel: "Industry context — Automobile & Automotive",
  stageOrder: 2,
} as const;

export const AUTOMOBILE_QUESTIONS: QuestionnaireQuestion[] = [
  {
    code: "Q-AUTO-SEGMENT",
    ...STAGE,
    industryDomain: DOMAIN,
    label: "What is your primary automotive segment?",
    helpText:
      "OEM, dealership, fleet, and connected-vehicle platforms process different mixes of customer, driver, and telemetry data.",
    valueType: "string",
    options: [
      "OEM",
      "DEALERSHIP",
      "FLEET",
      "EV_CONNECTED",
      "AFTERMARKET",
      "OTHER",
    ],
    required: true,
  },
  {
    code: "Q-AUTO-CONNECTED",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do vehicles / apps collect connected-car telemetry (location, VIN-linked usage, diagnostics)?",
    helpText:
      "Telemetry often qualifies as personal data when linkable to a customer or VIN — map purposes and retention.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-AUTO-TELEMETRY-NOTICE",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is in-vehicle / app notice clear about what telemetry is collected and for which purposes?",
    helpText:
      "Upload connected-car privacy notice / owner manual excerpts under Documents when telemetry is collected.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-AUTO-CONNECTED", equals: true },
  },
  {
    code: "Q-AUTO-BIOMETRIC",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do you process biometrics (driver face/voice, fingerprint unlock, cabin cameras)?",
    helpText:
      "Biometric and cabin-camera data needs heightened safeguards and purpose limitation under DPDP.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-AUTO-DEALER-CRM",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Do dealerships / service centres share customer CRM data with the OEM or group companies?",
    helpText:
      "Multi-party sales/service networks need processor terms and purpose-bound sharing.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-AUTO-DEALER-DPA",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Are those shares covered by contracts / DPAs with purpose limits?",
    helpText: "Upload sample dealer/OEM data-sharing terms under Vendor documents.",
    valueType: "boolean",
    required: true,
    showIf: { code: "Q-AUTO-DEALER-CRM", equals: true },
  },
  {
    code: "Q-AUTO-MARKETING",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is post-sale marketing (service reminders, finance offers) sent only with purpose-specific consent / preferences?",
    helpText:
      "Bundling loan/insurance offers into a single silent consent fails DPDP consent quality tests.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-AUTO-RETENTION",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Is retention defined for vehicle history, warranty, and telemetry (then erasure / anonymisation)?",
    helpText:
      "Map warranty and regulatory holds, then delete or anonymise when the purpose ends.",
    valueType: "boolean",
    required: true,
  },
  {
    code: "Q-AUTO-RIGHTS",
    ...STAGE,
    industryDomain: DOMAIN,
    label:
      "Can you fulfil access / erasure for a customer across CRM, connected apps, and dealer systems?",
    helpText:
      "Rights must reach downstream dealer and telematics copies, not only the central profile.",
    valueType: "boolean",
    required: true,
  },
];
