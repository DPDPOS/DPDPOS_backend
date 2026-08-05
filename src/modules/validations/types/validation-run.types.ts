import type {
  ValidationRunStatus,
  ValidationTriggerType,
} from "@prisma/client";

export type ValidationRunRecord = {
  id: string;
  organizationId: string;

  triggerType: ValidationTriggerType;
  triggeredBy: string | null;
  status: ValidationRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ValidationRunResponse = {
  id: string;

  triggerType: string;
  triggeredBy: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;

  createdAt: string;
  updatedAt: string;
};

export function toValidationRunResponse(
  run: ValidationRunRecord,
): ValidationRunResponse {
  return {
    id: run.id,

    triggerType: run.triggerType,
    triggeredBy: run.triggeredBy,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationMs: run.durationMs,

    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}
