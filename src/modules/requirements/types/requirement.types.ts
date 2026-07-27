import type { Requirement } from "@prisma/client";

export type RequirementResponse = {
  id: string;
  organizationId: string;
  frameworkId: string;
  controlId: string | null;
  code: string;
  title: string;
  description: string | null;
  legalBasisRef: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
