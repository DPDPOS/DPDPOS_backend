import type { Control, Framework, Requirement } from "@prisma/client";

export type ControlResponse = {
  id: string;
  organizationId: string;
  frameworkId: string;
  code: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  dueAt: string | null;
  status: string;
  legalBasisRef: string | null;
};

export type RequirementResponse = {
  id: string;
  organizationId: string;
  frameworkId: string;
  controlId: string | null;
  code: string;
  title: string;
  description: string | null;
  legalBasisRef: string | null;
};

export type FrameworkResponse = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  industryProfile: string | null;
  maturityLevel: string | null;
  isSdf: boolean;
  roadmapJson: unknown;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  controls: ControlResponse[];
  requirements: RequirementResponse[];
};

export function toControlResponse(row: Control): ControlResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    frameworkId: row.frameworkId,
    code: row.code,
    title: row.title,
    description: row.description,
    ownerUserId: row.ownerUserId,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    legalBasisRef: row.legalBasisRef,
  };
}

export function toRequirementResponse(row: Requirement): RequirementResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    frameworkId: row.frameworkId,
    controlId: row.controlId,
    code: row.code,
    title: row.title,
    description: row.description,
    legalBasisRef: row.legalBasisRef,
  };
}

export function toFrameworkResponse(
  row: Framework & {
    controls?: Control[];
    requirements?: Requirement[];
  },
): FrameworkResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    industryProfile: row.industryProfile,
    maturityLevel: row.maturityLevel,
    isSdf: row.isSdf,
    roadmapJson: row.roadmapJson,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    controls: (row.controls ?? []).map(toControlResponse),
    requirements: (row.requirements ?? []).map(toRequirementResponse),
  };
}
