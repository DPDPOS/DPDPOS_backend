import type {
  Prisma,
  DataSubjectRequest as PrismaDataSubjectRequest,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { DataSubjectRequestRecord } from "../types/data-subject-request.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateDataSubjectRequestData = {
  requestType: DataSubjectRequestType;
  requesterReference: string;
  assignedTo?: string;
  dueAt?: Date;
};

export type UpdateDataSubjectRequestData = {
  assignedTo?: string | null;
  status?: DataSubjectRequestStatus;
  resolutionSummary?: string | null;
  closedAt?: Date | null;
};

export type ListDataSubjectRequestsOptions = {
  requestType?: DataSubjectRequestType;
  status?: DataSubjectRequestStatus;
  assignedTo?: string;
  includeDeleted?: boolean;
};

function mapRequest(
  row: PrismaDataSubjectRequest,
): DataSubjectRequestRecord {
  return {
    id: row.id,

    organizationId: row.organizationId,

    requestType: row.requestType,
    requesterReference: row.requesterReference,
    status: row.status,
    assignedTo: row.assignedTo,

    openedAt: row.openedAt,
    dueAt: row.dueAt,
    closedAt: row.closedAt,

    resolutionSummary: row.resolutionSummary,

    version: row.version,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class DataSubjectRequestRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<DataSubjectRequestRecord | null> {
    const row = await prisma.dataSubjectRequest.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapRequest(row) : null;
  }

  async list(
    organizationId: string,
    options: ListDataSubjectRequestsOptions = {},
  ): Promise<DataSubjectRequestRecord[]> {
    const rows = await prisma.dataSubjectRequest.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.requestType
          ? { requestType: options.requestType }
          : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.assignedTo ? { assignedTo: options.assignedTo } : {}),
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    return rows.map(mapRequest);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateDataSubjectRequestData,
  ): Promise<DataSubjectRequestRecord> {
    const row = await db.dataSubjectRequest.create({
      data: {
        organizationId: ctx.organizationId,

        requestType: data.requestType,
        requesterReference: data.requesterReference,
        assignedTo: data.assignedTo,
        dueAt: data.dueAt,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapRequest(row);
  }

  /**
   * Optimistic-lock update: applies the change only when the caller's
   * expected version still matches, and increments the version.
   * Returns null when the version is stale (row unchanged).
   */
  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    expectedVersion: number,
    data: UpdateDataSubjectRequestData,
  ): Promise<DataSubjectRequestRecord | null> {
    const result = await db.dataSubjectRequest.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        ...(data.assignedTo !== undefined
          ? { assignedTo: data.assignedTo }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
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

    const row = await db.dataSubjectRequest.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });

    return row ? mapRequest(row) : null;
  }
}
