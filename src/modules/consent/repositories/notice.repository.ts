import type { Prisma, Notice as PrismaNotice, NoticeContentFormat } from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { NoticeRecord } from "../types/notice.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateNoticeData = {
  title: string;
  version: number;
  content: string;
  contentFormat?: NoticeContentFormat;
  effectiveFrom?: Date;
};

function mapNotice(row: PrismaNotice): NoticeRecord {
  return {
    id: row.id,

    organizationId: row.organizationId,

    title: row.title,
    version: row.version,
    content: row.content,
    contentFormat: row.contentFormat,
    effectiveFrom: row.effectiveFrom,
    publishedBy: row.publishedBy,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class NoticeRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<NoticeRecord | null> {
    const row = await prisma.notice.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapNotice(row) : null;
  }

  async findByTitleAndVersion(
    organizationId: string,
    title: string,
    version: number,
  ): Promise<NoticeRecord | null> {
    const row = await prisma.notice.findFirst({
      where: {
        title,
        version,
        ...this.tenantWhere({ organizationId }),
      },
    });
    return row ? mapNotice(row) : null;
  }

  async list(
    organizationId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<NoticeRecord[]> {
    const rows = await prisma.notice.findMany({
      where: this.tenantWhere({
        organizationId,
        includeDeleted: options.includeDeleted,
      }),
      orderBy: {
        createdAt: "desc",
      },
    });

    return rows.map(mapNotice);
  }

  async findLatestByTitle(
    organizationId: string,
    title: string,
  ): Promise<NoticeRecord | null> {
    const row = await prisma.notice.findFirst({
      where: {
        title,
        ...this.tenantWhere({ organizationId }),
      },
      orderBy: {
        version: "desc",
      },
    });

    return row ? mapNotice(row) : null;
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateNoticeData,
  ): Promise<NoticeRecord> {
    const row = await db.notice.create({
      data: {
        organizationId: ctx.organizationId,

        title: data.title,
        version: data.version,
        content: data.content,
        contentFormat: data.contentFormat ?? "PLAIN",
        effectiveFrom: data.effectiveFrom,
        publishedBy: ctx.actorUserId,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapNotice(row);
  }

  async softDelete(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<NoticeRecord> {
    const row = await db.notice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapNotice(row);
  }
}
