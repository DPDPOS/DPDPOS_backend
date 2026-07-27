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
  createdAt: string;
  updatedAt: string;
};

export type OrganizationCreateResult = {
  organization: OrganizationResponse;
  systemRoles: string[];
};

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
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}
