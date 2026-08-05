import type {
  RemediationTaskSource,
  RemediationTaskStatus,
} from "@prisma/client";

export type RemediationTaskRecord = {
  id: string;
  organizationId: string;

  violationId: string;
  source: RemediationTaskSource;
  taskTitle: string;
  taskDescription: string | null;
  status: RemediationTaskStatus;
  assignedTo: string | null;

  dueAt: Date | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  closedAt: Date | null;

  verificationNotes: string | null;
  resolutionSummary: string | null;

  version: number;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type RemediationTaskResponse = {
  id: string;

  violationId: string;
  source: string;
  taskTitle: string;
  taskDescription: string | null;
  status: string;
  assignedTo: string | null;

  dueAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  closedAt: string | null;

  verificationNotes: string | null;
  resolutionSummary: string | null;

  version: number;

  createdAt: string;
  updatedAt: string;
};

export function toRemediationTaskResponse(
  task: RemediationTaskRecord,
): RemediationTaskResponse {
  return {
    id: task.id,

    violationId: task.violationId,
    source: task.source,
    taskTitle: task.taskTitle,
    taskDescription: task.taskDescription,
    status: task.status,
    assignedTo: task.assignedTo,

    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    verifiedAt: task.verifiedAt ? task.verifiedAt.toISOString() : null,
    verifiedBy: task.verifiedBy,
    closedAt: task.closedAt ? task.closedAt.toISOString() : null,

    verificationNotes: task.verificationNotes,
    resolutionSummary: task.resolutionSummary,

    version: task.version,

    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
