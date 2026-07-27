import type { Control } from "@prisma/client";

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
  createdAt: string;
  updatedAt: string;
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
