import type {
  Prisma,
  Violation as PrismaViolation,
  RuleSeverity,
  ViolationStatus,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { ViolationRecord } from "../types/violation.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateViolationData = {
  validationResultId?: string;
  severity: RuleSeverity;
  title: string;
  description?: string;
  assignedTo?: string;
  dueAt?: Date;
  evidenceRequiredFlag?: boolean;
};

export type UpdateViolationData = {
  title?: string;
  description?: string | null;
  severity?: RuleSeverity;
  assignedTo?: string | null;
  status?: ViolationStatus;
  dueAt?: Date | null;
  resolutionSummary?: string | null;
  closedAt?: Date | null;
};

export type ListViolationsOptions = {
  status?: ViolationStatus;
  severity?: RuleSeverity;
  assignedTo?: string;
  includeDeleted?: boolean;
};

function mapViolation(row: PrismaViolation): ViolationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,

    validationResultId: row.validationResultId,
    severity: row.severity,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assignedTo,

    openedAt: row.openedAt,
    dueAt: row.dueAt,
    closedAt: row.closedAt,

    resolutionSummary: row.resolutionSummary,
    evidenceRequiredFlag: row.evidenceRequiredFlag,

    version: row.version,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ViolationRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ViolationRecord | null> {
    const row = await prisma.violation.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapViolation(row) : null;
  }

  /** Event-handler dedupe: a violation already open for this validation result. */
  async findByValidationResult(
    organizationId: string,
    validationResultId: string,
  ): Promise<ViolationRecord | null> {
    const row = await prisma.violation.findFirst({
      where: {
        validationResultId,
        ...this.tenantWhere({ organizationId }),
      },
    });

    return row ? mapViolation(row) : null;
  }

  async list(
    organizationId: string,
    options: ListViolationsOptions = {},
  ): Promise<ViolationRecord[]> {
    const rows = await prisma.violation.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.status ? { status: options.status } : {}),
        ...(options.severity ? { severity: options.severity } : {}),
        ...(options.assignedTo ? { assignedTo: options.assignedTo } : {}),
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    return rows.map(mapViolation);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateViolationData,
  ): Promise<ViolationRecord> {
    const row = await db.violation.create({
      data: {
        organizationId: ctx.organizationId,

        validationResultId: data.validationResultId,
        severity: data.severity,
        title: data.title,
        description: data.description,
        assignedTo: data.assignedTo,
        dueAt: data.dueAt,
        evidenceRequiredFlag: data.evidenceRequiredFlag ?? false,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapViolation(row);
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
    data: UpdateViolationData,
  ): Promise<ViolationRecord | null> {
    const result = await db.violation.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.severity !== undefined ? { severity: data.severity } : {}),
        ...(data.assignedTo !== undefined
          ? { assignedTo: data.assignedTo }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        ...(data.resolutionSummary !== undefined
          ? { resolutionSummary: data.resolutionSummary }
          : {}),
        ...(data.closedAt !== undefined ? { closedAt: data.closedAt } : {}),
        version: { increment: 1 },
        ...this.auditUpdateFields(ctx),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await db.violation.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });

    return row ? mapViolation(row) : null;
  }
}
