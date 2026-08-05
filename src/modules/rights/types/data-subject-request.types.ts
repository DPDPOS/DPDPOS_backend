import {
  DataSubjectRequestStatus,
  DataSubjectRequestType,
} from "@prisma/client";

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

  version: number;

  createdAt: string;
  updatedAt: string;
};

export function toDataSubjectRequestResponse(
  request: DataSubjectRequestRecord,
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

    version: request.version,

    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}
