import type {
  Prisma,
  RemediationTask as PrismaRemediationTask,
  RemediationTaskSource,
  RemediationTaskStatus,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { RemediationTaskRecord } from "../types/remediation-task.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateRemediationTaskData = {
  violationId: string;
  source: RemediationTaskSource;
  taskTitle: string;
  taskDescription?: string;
  assignedTo?: string;
  dueAt?: Date;
};

export type UpdateRemediationTaskData = {
  taskTitle?: string;
  taskDescription?: string | null;
  status?: RemediationTaskStatus;
  assignedTo?: string | null;
  dueAt?: Date | null;
  verificationNotes?: string | null;
  resolutionSummary?: string | null;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  closedAt?: Date | null;
};

export type ListRemediationTasksOptions = {
  status?: RemediationTaskStatus;
  violationId?: string;
  assignedTo?: string;
  includeDeleted?: boolean;
};

function mapRemediationTask(row: PrismaRemediationTask): RemediationTaskRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,

    violationId: row.violationId,
    source: row.source,
    taskTitle: row.taskTitle,
    taskDescription: row.taskDescription,
    status: row.status,
    assignedTo: row.assignedTo,

    dueAt: row.dueAt,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    closedAt: row.closedAt,

    verificationNotes: row.verificationNotes,
    resolutionSummary: row.resolutionSummary,

    version: row.version,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class RemediationTaskRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<RemediationTaskRecord | null> {
    const row = await prisma.remediationTask.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapRemediationTask(row) : null;
  }

  /**
   * Event-handler dedupe: the AUTO task already created for this violation
   * (backed by the partial unique index on organization_id + violation_id
   * WHERE source = 'AUTO').
   */
  async findAutoTaskByViolation(
    organizationId: string,
    violationId: string,
  ): Promise<RemediationTaskRecord | null> {
    const row = await prisma.remediationTask.findFirst({
      where: {
        violationId,
        source: "AUTO",
        ...this.tenantWhere({ organizationId }),
      },
    });

    return row ? mapRemediationTask(row) : null;
  }

  async list(
    organizationId: string,
    options: ListRemediationTasksOptions = {},
  ): Promise<RemediationTaskRecord[]> {
    const rows = await prisma.remediationTask.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.status ? { status: options.status } : {}),
        ...(options.violationId
          ? { violationId: options.violationId }
          : {}),
        ...(options.assignedTo ? { assignedTo: options.assignedTo } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return rows.map(mapRemediationTask);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateRemediationTaskData,
  ): Promise<RemediationTaskRecord> {
    const row = await db.remediationTask.create({
      data: {
        organizationId: ctx.organizationId,

        violationId: data.violationId,
        source: data.source,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription,
        assignedTo: data.assignedTo,
        dueAt: data.dueAt,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapRemediationTask(row);
  }

  /**
   * Optimistic-lock update: applies changes only when the caller's expected
   * version matches, incrementing the version. Returns null when stale.
   */
  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    expectedVersion: number,
    data: UpdateRemediationTaskData,
  ): Promise<RemediationTaskRecord | null> {
    const result = await db.remediationTask.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        ...(data.taskTitle !== undefined
          ? { taskTitle: data.taskTitle }
          : {}),
        ...(data.taskDescription !== undefined
          ? { taskDescription: data.taskDescription }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assignedTo !== undefined
          ? { assignedTo: data.assignedTo }
          : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        ...(data.verificationNotes !== undefined
          ? { verificationNotes: data.verificationNotes }
          : {}),
        ...(data.resolutionSummary !== undefined
          ? { resolutionSummary: data.resolutionSummary }
          : {}),
        ...(data.verifiedAt !== undefined
          ? { verifiedAt: data.verifiedAt }
          : {}),
        ...(data.verifiedBy !== undefined
          ? { verifiedBy: data.verifiedBy }
          : {}),
        ...(data.closedAt !== undefined ? { closedAt: data.closedAt } : {}),
        version: { increment: 1 },
        ...this.auditUpdateFields(ctx),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await db.remediationTask.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });

    return row ? mapRemediationTask(row) : null;
  }
}
