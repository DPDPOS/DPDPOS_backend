import {
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  Prisma,
} from "@prisma/client";

export type VerificationChecklistItem = {
  key: string;
  label: string;
  vendorId?: string | null;
  pending: boolean;
  notes?: string | null;
};

export type DataSubjectRequestRecord = {
  id: string;
  organizationId: string;

  requestType: DataSubjectRequestType;
  requesterReference: string;
  status: DataSubjectRequestStatus;
  assignedTo: string | null;

  openedAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;

  resolutionSummary: string | null;
  verificationChecklistJson: VerificationChecklistItem[] | null;

  version: number;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DataSubjectRequestResponse = {
  id: string;

  requestType: string;
  requesterReference: string;
  status: string;
  assignedTo: string | null;

  openedAt: string;
  dueAt: string | null;
  closedAt: string | null;

  resolutionSummary: string | null;
  verificationChecklist: VerificationChecklistItem[] | null;

  version: number;
  deduped?: boolean;

  createdAt: string;
  updatedAt: string;
};

function asChecklist(value: unknown): VerificationChecklistItem[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    .map((v) => ({
      key: String(v.key ?? ""),
      label: String(v.label ?? ""),
      vendorId: typeof v.vendorId === "string" ? v.vendorId : null,
      pending: v.pending !== false,
      notes: typeof v.notes === "string" ? v.notes : null,
    }))
    .filter((v) => v.key && v.label);
}

export function toDataSubjectRequestResponse(
  request: DataSubjectRequestRecord,
  options: { deduped?: boolean } = {},
): DataSubjectRequestResponse {
  return {
    id: request.id,

    requestType: request.requestType,
    requesterReference: request.requesterReference,
    status: request.status,
    assignedTo: request.assignedTo,

    openedAt: request.openedAt.toISOString(),
    dueAt: request.dueAt ? request.dueAt.toISOString() : null,
    closedAt: request.closedAt ? request.closedAt.toISOString() : null,

    resolutionSummary: request.resolutionSummary,
    verificationChecklist: request.verificationChecklistJson,

    version: request.version,
    ...(options.deduped ? { deduped: true } : {}),

    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function checklistToJson(
  items: VerificationChecklistItem[],
): Prisma.InputJsonValue {
  return items as unknown as Prisma.InputJsonValue;
}

export { asChecklist };
