import type {
  Prisma,
  ProcessingActivity as PrismaProcessingActivity,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { ProcessingActivityRecord } from "../types/processing-activity.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateProcessingActivityData = {
  dataAssetId: string;

  purpose: string;

  sourceSystem?: string;
  recipientType?: string;
  processorName?: string;
  vendorId?: string | null;
  legalBasis?: string;
  retentionRule?: string;
  notes?: string;
};

export type UpdateProcessingActivityData = {
  dataAssetId?: string;

  purpose?: string;

  sourceSystem?: string | null;
  recipientType?: string | null;
  processorName?: string | null;
  vendorId?: string | null;
  legalBasis?: string | null;
  retentionRule?: string | null;
  notes?: string | null;
};

function mapProcessingActivity(
  row: PrismaProcessingActivity,
): ProcessingActivityRecord {
  return {
    id: row.id,

    organizationId: row.organizationId,
    dataAssetId: row.dataAssetId,
    vendorId: row.vendorId,

    purpose: row.purpose,

    sourceSystem: row.sourceSystem,
    recipientType: row.recipientType,
    processorName: row.processorName,
    legalBasis: row.legalBasis,
    retentionRule: row.retentionRule,
    notes: row.notes,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ProcessingActivityRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ProcessingActivityRecord | null> {
    const row = await prisma.processingActivity.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapProcessingActivity(row) : null;
  }

  async list(
    organizationId: string,
    options: { dataAssetId?: string; includeDeleted?: boolean } = {},
  ): Promise<ProcessingActivityRecord[]> {
    const rows = await prisma.processingActivity.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.dataAssetId
          ? { dataAssetId: options.dataAssetId }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return rows.map(mapProcessingActivity);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateProcessingActivityData,
  ): Promise<ProcessingActivityRecord> {
    const row = await db.processingActivity.create({
      data: {
        organizationId: ctx.organizationId,

        dataAssetId: data.dataAssetId,

        purpose: data.purpose,

        sourceSystem: data.sourceSystem,
        recipientType: data.recipientType,
        processorName: data.processorName,
        vendorId: data.vendorId ?? undefined,
        legalBasis: data.legalBasis,
        retentionRule: data.retentionRule,
        notes: data.notes,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapProcessingActivity(row);
  }

  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    data: UpdateProcessingActivityData,
  ): Promise<ProcessingActivityRecord> {
    const row = await db.processingActivity.update({
      where: { id },
      data: {
        ...(data.dataAssetId !== undefined
          ? { dataAssetId: data.dataAssetId }
          : {}),

        ...(data.purpose !== undefined
          ? { purpose: data.purpose }
          : {}),

        ...(data.sourceSystem !== undefined
          ? { sourceSystem: data.sourceSystem }
          : {}),

        ...(data.recipientType !== undefined
          ? { recipientType: data.recipientType }
          : {}),

        ...(data.processorName !== undefined
          ? { processorName: data.processorName }
          : {}),

        ...(data.vendorId !== undefined ? { vendorId: data.vendorId } : {}),

        ...(data.legalBasis !== undefined
          ? { legalBasis: data.legalBasis }
          : {}),

        ...(data.retentionRule !== undefined
          ? { retentionRule: data.retentionRule }
          : {}),

        ...(data.notes !== undefined
          ? { notes: data.notes }
          : {}),

        ...this.auditUpdateFields(ctx),
      },
    });

    return mapProcessingActivity(row);
  }

  async softDelete(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<ProcessingActivityRecord> {
    const row = await db.processingActivity.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapProcessingActivity(row);
  }
}
