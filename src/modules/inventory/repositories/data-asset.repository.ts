import type { Prisma } from "@prisma/client";
import type { DataAsset as PrismaDataAsset } from "@prisma/client";


import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { DataAssetRecord } from "../types/data-asset.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateDataAssetData = {
  assetName: string;
  assetType: string;
  category: string;
  sensitivity: PrismaDataAsset["sensitivity"];

  description?: string;

  storageLocation?: string;
  retentionPeriod?: string;

  departmentId?: string;
  ownerUserId?: string;
};

export type UpdateDataAssetData = {
  assetName?: string;
  assetType?: string;
  category?: string;
  sensitivity?: PrismaDataAsset["sensitivity"];

  description?: string | null;

  storageLocation?: string | null;
  retentionPeriod?: string | null;

  departmentId?: string | null;
  ownerUserId?: string | null;
};

function mapDataAsset(row: PrismaDataAsset): DataAssetRecord {
  return {
    id: row.id,

    organizationId: row.organizationId,
    departmentId: row.departmentId,
    ownerUserId: row.ownerUserId,

    assetName: row.assetName,
    assetType: row.assetType,
    category: row.category,

    sensitivity: row.sensitivity,

    description: row.description,

    storageLocation: row.storageLocation,
    retentionPeriod: row.retentionPeriod,

    status: row.status,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class DataAssetRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<DataAssetRecord | null> {
    const row = await prisma.dataAsset.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapDataAsset(row) : null;
  }

  async list(
    organizationId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<DataAssetRecord[]> {
    const rows = await prisma.dataAsset.findMany({
      where: this.tenantWhere({
        organizationId,
        includeDeleted: options.includeDeleted,
      }),
      orderBy: {
        assetName: "asc",
      },
    });

    return rows.map(mapDataAsset);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateDataAssetData,
  ): Promise<DataAssetRecord> {
    const row = await db.dataAsset.create({
      data: {
        organizationId: ctx.organizationId,

        assetName: data.assetName,
        assetType: data.assetType,
        category: data.category,
        sensitivity: data.sensitivity,

        description: data.description,

        storageLocation: data.storageLocation,
        retentionPeriod: data.retentionPeriod,

        departmentId: data.departmentId,
        ownerUserId: data.ownerUserId,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapDataAsset(row);
  }

  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    data: UpdateDataAssetData,
  ): Promise<DataAssetRecord> {
    const row = await db.dataAsset.update({
      where: { id },
      data: {
        ...(data.assetName !== undefined
          ? { assetName: data.assetName }
          : {}),

        ...(data.assetType !== undefined
          ? { assetType: data.assetType }
          : {}),

        ...(data.category !== undefined
          ? { category: data.category }
          : {}),

        ...(data.sensitivity !== undefined
          ? { sensitivity: data.sensitivity }
          : {}),

        ...(data.description !== undefined
          ? { description: data.description }
          : {}),

        ...(data.storageLocation !== undefined
          ? { storageLocation: data.storageLocation }
          : {}),

        ...(data.retentionPeriod !== undefined
          ? { retentionPeriod: data.retentionPeriod }
          : {}),

        ...(data.departmentId !== undefined
          ? { departmentId: data.departmentId }
          : {}),

        ...(data.ownerUserId !== undefined
          ? { ownerUserId: data.ownerUserId }
          : {}),

        ...this.auditUpdateFields(ctx),
      },
    });

    return mapDataAsset(row);
  }

  async archive(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<DataAssetRecord> {
    const row = await db.dataAsset.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        deletedAt: new Date(),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapDataAsset(row);
  }
}
