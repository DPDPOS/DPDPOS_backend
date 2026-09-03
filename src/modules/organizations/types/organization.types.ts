export type OrganizationRecord = {
  id: string;
  name: string;
  industry: string | null;
  companySize: string | null;
  operatingRegion: string | null;
  companyType: string | null;
  maturityLevel: string | null;
  isSignificantDataFiduciary: boolean;
  status: string;
  consentManagerMode: string;
  consentManagerUrl: string | null;
  consentManagerWebhookSecret: string | null;
  dsrRoutingJson: Record<string, string> | null;
  onboardingCompletedAt: Date | null;
  onboardingCompletedBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type OrganizationResponse = {
  id: string;
  name: string;
  industry: string | null;
  companySize: string | null;
  operatingRegion: string | null;
  companyType: string | null;
  maturityLevel: string | null;
  isSignificantDataFiduciary: boolean;
  status: string;
  consentManagerMode: string;
  consentManagerUrl: string | null;
  hasConsentManagerWebhookSecret: boolean;
  dsrRoutingJson: Record<string, string> | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationCreateResult = {
  organization: OrganizationResponse;
  systemRoles: string[];
};

function asRoutingMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

export function toOrganizationResponse(
  org: OrganizationRecord,
): OrganizationResponse {
  return {
    id: org.id,
    name: org.name,
    industry: org.industry,
    companySize: org.companySize,
    operatingRegion: org.operatingRegion,
    companyType: org.companyType,
    maturityLevel: org.maturityLevel,
    isSignificantDataFiduciary: org.isSignificantDataFiduciary,
    status: org.status,
    consentManagerMode: org.consentManagerMode,
    consentManagerUrl: org.consentManagerUrl,
    hasConsentManagerWebhookSecret: Boolean(org.consentManagerWebhookSecret),
    dsrRoutingJson: org.dsrRoutingJson,
    onboardingCompleted: Boolean(org.onboardingCompletedAt),
    onboardingCompletedAt: org.onboardingCompletedAt
      ? org.onboardingCompletedAt.toISOString()
      : null,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export { asRoutingMap };
