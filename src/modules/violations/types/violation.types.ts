import type {
  FindingSource,
  RuleSeverity,
  ViolationStatus,
} from "@prisma/client";

export type ViolationRecord = {
  id: string;
  organizationId: string;

  validationResultId: string | null;
  sourceKey: string | null;
  findingSource: FindingSource;
  dedupeKey: string | null;
  complianceFindingId: string | null;
  agentId: string | null;
  assessmentId: string | null;
  severity: RuleSeverity;
  title: string;
  description: string | null;
  status: ViolationStatus;
  assignedTo: string | null;

  openedAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;

  resolutionSummary: string | null;
  evidenceRequiredFlag: boolean;

  version: number;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViolationResponse = {
  id: string;

  validationResultId: string | null;
  findingSource: string;
  dedupeKey: string | null;
  complianceFindingId: string | null;
  agentId: string | null;
  assessmentId: string | null;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string | null;

  openedAt: string;
  dueAt: string | null;
  closedAt: string | null;

  resolutionSummary: string | null;
  evidenceRequiredFlag: boolean;

  version: number;

  createdAt: string;
  updatedAt: string;
};

export function toViolationResponse(
  violation: ViolationRecord,
): ViolationResponse {
  return {
    id: violation.id,

    validationResultId: violation.validationResultId,
    findingSource: violation.findingSource,
    dedupeKey: violation.dedupeKey,
    complianceFindingId: violation.complianceFindingId,
    agentId: violation.agentId,
    assessmentId: violation.assessmentId,
    severity: violation.severity,
    title: violation.title,
    description: violation.description,
    status: violation.status,
    assignedTo: violation.assignedTo,

    openedAt: violation.openedAt.toISOString(),
    dueAt: violation.dueAt ? violation.dueAt.toISOString() : null,
    closedAt: violation.closedAt ? violation.closedAt.toISOString() : null,

    resolutionSummary: violation.resolutionSummary,
    evidenceRequiredFlag: violation.evidenceRequiredFlag,

    version: violation.version,

    createdAt: violation.createdAt.toISOString(),
    updatedAt: violation.updatedAt.toISOString(),
  };
}
