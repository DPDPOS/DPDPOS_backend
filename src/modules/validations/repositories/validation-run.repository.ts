import type {
  Prisma,
  ValidationRun as PrismaValidationRun,
  ValidationRunStatus,
  ValidationTriggerType,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { ValidationRunRecord } from "../types/validation-run.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateValidationRunData = {
  triggerType: ValidationTriggerType;
  triggeredBy?: string;
  status?: ValidationRunStatus;
  startedAt?: Date;
};

export type UpdateValidationRunData = {
  status?: ValidationRunStatus;
  finishedAt?: Date | null;
  durationMs?: number | null;
};

export type ListValidationRunsOptions = {
  status?: ValidationRunStatus;
  includeDeleted?: boolean;
};

function mapRun(row: PrismaValidationRun): ValidationRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,

    triggerType: row.triggerType,
    triggeredBy: row.triggeredBy,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ValidationRunRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ValidationRunRecord | null> {
    const row = await prisma.validationRun.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapRun(row) : null;
  }

  /**
   * Worker-internal unscoped load: the execution engine must resolve a run by
   * id before it knows the organization. Only reachable from the trusted
   * worker process, never from the API layer.
   */
  async findByIdForWorker(id: string): Promise<ValidationRunRecord | null> {
    const row = await prisma.validationRun.findFirst({
      where: { id, deletedAt: null },
    });

    return row ? mapRun(row) : null;
  }

  async list(
    organizationId: string,
    options: ListValidationRunsOptions = {},
  ): Promise<ValidationRunRecord[]> {
    const rows = await prisma.validationRun.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    return rows.map(mapRun);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateValidationRunData,
  ): Promise<ValidationRunRecord> {
    const row = await db.validationRun.create({
      data: {
        organizationId: ctx.organizationId,

        triggerType: data.triggerType,
        triggeredBy: data.triggeredBy ?? ctx.actorUserId,
        status: data.status ?? "PENDING",
        startedAt: data.startedAt ?? new Date(),

        ...this.auditCreateFields(ctx),
      },
    });

    return mapRun(row);
  }

  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    data: UpdateValidationRunData,
  ): Promise<ValidationRunRecord> {
    const row = await db.validationRun.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.finishedAt !== undefined
          ? { finishedAt: data.finishedAt }
          : {}),
        ...(data.durationMs !== undefined
          ? { durationMs: data.durationMs }
          : {}),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapRun(row);
  }
}
