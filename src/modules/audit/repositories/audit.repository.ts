import { Prisma, type AuditLog as PrismaAuditLog } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { AuditLogRecord } from "../dto/audit-response.dto.js";
import { SYSTEM_ACTOR_ID } from "../../../shared/constants/system-actor.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapRow(row: PrismaAuditLog): AuditLogRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

export class AuditRepository extends BaseRepository {
  async create(
    db: DbClient,
    data: {
      organizationId: string;
      actorUserId?: string | null;
      actionType: string;
      entityType?: string | null;
      entityId?: string | null;
      beforeJson?: any | null;
      afterJson?: any | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      correlationId?: string | null;
    }
  ) {
    const row = await db.auditLog.create({
      data: {
        organizationId: data.organizationId,
        actorUserId: data.actorUserId ?? SYSTEM_ACTOR_ID,
        actionType: data.actionType,
        entityType: data.entityType ?? "unknown",
        entityId: data.entityId ?? "unknown",
        beforeJson: data.beforeJson ?? Prisma.DbNull,
        afterJson: data.afterJson ?? Prisma.DbNull,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        correlationId: data.correlationId,
      },
    });
    return mapRow(row);
  }

  async findByOrg(
    organizationId: string,
    filters: {
      entityType?: string;
      actionType?: string;
      actorUserId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    cursor?: string,
    limit: number = 50
  ) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.actionType && { actionType: filters.actionType }),
      ...(filters.actorUserId && { actorUserId: filters.actorUserId }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
    };

    const rows = await prisma.auditLog.findMany({
      where,
      take: limit + 1, // for next cursor
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor element itself
      }),
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapRow);
  }

  async findByEntity(organizationId: string, entityType: string, entityId: string) {
    const rows = await prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRow);
  }

  async countByOrg(
    organizationId: string,
    filters: {
      entityType?: string;
      actionType?: string;
      actorUserId?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ) {
    return prisma.auditLog.count({
      where: {
        organizationId,
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.actionType && { actionType: filters.actionType }),
        ...(filters.actorUserId && { actorUserId: filters.actorUserId }),
        ...((filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
          },
        }),
      },
    });
  }
}
