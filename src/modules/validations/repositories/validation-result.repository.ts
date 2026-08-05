import type {
  Prisma,
  ValidationResult as PrismaValidationResult,
  ValidationResultStatus,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { ValidationResultRecord } from "../types/validation-result.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateValidationResultData = {
  runId: string;
  ruleId: string;
  ruleCode: string;
  resultStatus: ValidationResultStatus;
  explanation?: string;
  score?: number;
  evidenceRequiredFlag?: boolean;
  controlId?: string;
};

function mapResult(row: PrismaValidationResult): ValidationResultRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    runId: row.runId,
    ruleId: row.ruleId,

    ruleCode: row.ruleCode,
    resultStatus: row.resultStatus,
    explanation: row.explanation,
    score: row.score,
    evidenceRequiredFlag: row.evidenceRequiredFlag,
    controlId: row.controlId,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ValidationResultRepository extends BaseRepository {
  async listByRun(
    organizationId: string,
    runId: string,
  ): Promise<ValidationResultRecord[]> {
    const rows = await prisma.validationResult.findMany({
      where: {
        runId,
        ...this.tenantWhere({ organizationId }),
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return rows.map(mapResult);
  }

  /**
   * Idempotent write: one result row per (runId, ruleId). Retried jobs upsert
   * rather than duplicate — safe under at-least-once delivery.
   */
  async upsert(
    db: DbClient,
    ctx: RequestContext,
    data: CreateValidationResultData,
  ): Promise<ValidationResultRecord> {
    const row = await db.validationResult.upsert({
      where: {
        runId_ruleId: {
          runId: data.runId,
          ruleId: data.ruleId,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        runId: data.runId,
        ruleId: data.ruleId,
        ruleCode: data.ruleCode,
        resultStatus: data.resultStatus,
        explanation: data.explanation,
        score: data.score,
        evidenceRequiredFlag: data.evidenceRequiredFlag ?? false,
        controlId: data.controlId,
        ...this.auditCreateFields(ctx),
      },
      update: {
        resultStatus: data.resultStatus,
        explanation: data.explanation,
        score: data.score,
        evidenceRequiredFlag: data.evidenceRequiredFlag ?? false,
        controlId: data.controlId,
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapResult(row);
  }
}
