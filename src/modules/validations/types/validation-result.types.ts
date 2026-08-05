import type { ValidationResultStatus } from "@prisma/client";

export type ValidationResultRecord = {
  id: string;
  organizationId: string;
  runId: string;
  ruleId: string;

  ruleCode: string;
  resultStatus: ValidationResultStatus;
  explanation: string | null;
  score: number | null;
  evidenceRequiredFlag: boolean;
  controlId: string | null;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ValidationResultResponse = {
  id: string;
  runId: string;
  ruleId: string;

  ruleCode: string;
  resultStatus: string;
  explanation: string | null;
  score: number | null;
  evidenceRequiredFlag: boolean;
  controlId: string | null;

  createdAt: string;
  updatedAt: string;
};

export function toValidationResultResponse(
  result: ValidationResultRecord,
): ValidationResultResponse {
  return {
    id: result.id,
    runId: result.runId,
    ruleId: result.ruleId,

    ruleCode: result.ruleCode,
    resultStatus: result.resultStatus,
    explanation: result.explanation,
    score: result.score,
    evidenceRequiredFlag: result.evidenceRequiredFlag,
    controlId: result.controlId,

    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}
