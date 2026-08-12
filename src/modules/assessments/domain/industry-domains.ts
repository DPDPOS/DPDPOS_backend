/**
 * Canonical industry domains for dynamic DPDP questionnaires.
 * Free-text Organization.industry values are normalised into one of these keys.
 */

export const INDUSTRY_DOMAIN_KEYS = [
  "banking_finance",
  "healthcare",
  "ecommerce_retail",
  "education_edtech",
  "it_saas",
  "telecom",
] as const;

export type IndustryDomainKey = (typeof INDUSTRY_DOMAIN_KEYS)[number];

export const INDUSTRY_DOMAIN_LABELS: Record<IndustryDomainKey, string> = {
  banking_finance: "Banking, NBFC & Fintech",
  healthcare: "Healthcare & Health-tech",
  ecommerce_retail: "E-commerce & Retail",
  education_edtech: "Education & EdTech",
  it_saas: "IT, SaaS & B2B Tech",
  telecom: "Telecom & Digital Communications",
};

/** Settings / create-org dropdown values (stable keys stored on Organization.industry). */
export const INDUSTRY_DOMAIN_OPTIONS: Array<{
  value: IndustryDomainKey;
  label: string;
}> = INDUSTRY_DOMAIN_KEYS.map((value) => ({
  value,
  label: INDUSTRY_DOMAIN_LABELS[value],
}));

const ALIASES: Array<{ key: IndustryDomainKey; patterns: RegExp[] }> = [
  {
    key: "banking_finance",
    patterns: [
      /\bbanking\b/i,
      /\bfintech\b/i,
      /\bnbfc\b/i,
      /\bpayments?\b/i,
      /\blending\b/i,
      /\binsurtech\b/i,
      /\bfinancial\s+services\b/i,
      /\bbfsi\b/i,
      /\bwealth\b/i,
      /^banking_finance$/i,
    ],
  },
  {
    key: "healthcare",
    patterns: [
      /\bhealth[\s-]?care\b/i,
      /\bhealth[\s-]?tech\b/i,
      /\bhospital\b/i,
      /\bclinic\b/i,
      /\bpharma\b/i,
      /\btelemedicine\b/i,
      /\blife\s+sciences?\b/i,
      /^healthcare$/i,
    ],
  },
  {
    key: "ecommerce_retail",
    patterns: [
      /\be[\s-]?commerce\b/i,
      /\becommerce\b/i,
      /\bretail\b/i,
      /\bmarketplace\b/i,
      /\bd2c\b/i,
      /^ecommerce_retail$/i,
    ],
  },
  {
    key: "education_edtech",
    patterns: [
      /\bedtech\b/i,
      /\beducation\b/i,
      /\bschool\b/i,
      /\buniversity\b/i,
      /\bcoaching\b/i,
      /^education_edtech$/i,
    ],
  },
  {
    key: "it_saas",
    patterns: [
      /\bsaas\b/i,
      /\bsoftware\b/i,
      /\bit\/?ites\b/i,
      /\b\bit\b/i,
      /\btechnology\b/i,
      /\bb2b\s+tech\b/i,
      /\bcloud\b/i,
      /^it_saas$/i,
    ],
  },
  {
    key: "telecom",
    patterns: [
      /\btelecom\b/i,
      /\bisp\b/i,
      /\bcommunications?\b/i,
      /\bott\b/i,
      /^telecom$/i,
    ],
  },
];

/**
 * Map free-text or canonical industry strings to a domain key.
 * Returns null when unknown → core questionnaire only.
 */
export function normalizeIndustry(
  industry: string | null | undefined,
): IndustryDomainKey | null {
  if (!industry?.trim()) return null;
  const raw = industry.trim();
  if ((INDUSTRY_DOMAIN_KEYS as readonly string[]).includes(raw)) {
    return raw as IndustryDomainKey;
  }
  for (const { key, patterns } of ALIASES) {
    if (patterns.some((re) => re.test(raw))) return key;
  }
  return null;
}
