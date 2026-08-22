export type VendorRecord = {
  id: string;
  organizationId: string;
  name: string;
  legalName: string | null;
  vendorType: string;
  countries: string[];
  services: string | null;
  dataCategories: string[];
  criticality: string;
  status: string;
  inherentRiskScore: number | null;
  residualRiskScore: number | null;
  nextReviewAt: Date | null;
  ownerUserId: string | null;
  notes: string | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type VendorResponse = {
  id: string;
  name: string;
  legalName: string | null;
  vendorType: string;
  countries: string[];
  services: string | null;
  dataCategories: string[];
  criticality: string;
  status: string;
  inherentRiskScore: number | null;
  residualRiskScore: number | null;
  nextReviewAt: string | null;
  ownerUserId: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function toVendorResponse(v: VendorRecord): VendorResponse {
  return {
    id: v.id,
    name: v.name,
    legalName: v.legalName,
    vendorType: v.vendorType,
    countries: v.countries,
    services: v.services,
    dataCategories: v.dataCategories,
    criticality: v.criticality,
    status: v.status,
    inherentRiskScore: v.inherentRiskScore,
    residualRiskScore: v.residualRiskScore,
    nextReviewAt: v.nextReviewAt?.toISOString() ?? null,
    ownerUserId: v.ownerUserId,
    notes: v.notes,
    version: v.version,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export type VendorRiskScorecard = {
  vendorId: string;
  inherentRiskScore: number;
  residualRiskScore: number;
  criticality: string;
  factors: string[];
  hasActiveDpa: boolean;
  dpaExpiresAt: string | null;
  latestReviewOutcome: string | null;
  childCriticalCount: number;
  openRiskFlags: string[];
};
