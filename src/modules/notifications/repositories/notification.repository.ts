import type { Prisma, Notification as PrismaNotification } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { NotificationRecord } from "../dto/notification-response.dto.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapRow(row: PrismaNotification): NotificationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recipientUserId: row.recipientUserId,
    notificationType: row.notificationType,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    status: row.status,
    sentAt: row.sentAt,
    readAt: row.readAt,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    retryCount: row.retryCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class NotificationRepository extends BaseRepository {
  async create(db: DbClient, ctx: RequestContext, data: any) {
    const row = await db.notification.create({
      data: {
        organizationId: ctx.organizationId,
        ...data,
        ...this.auditCreateFields(ctx),
      },
    });
    return mapRow(row);
  }

  async findByRecipient(organizationId: string, recipientUserId: string, filters: any, page: number, pageSize: number) {
    const where = {
      ...this.tenantWhere({ organizationId }),
      recipientUserId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.notificationType ? { notificationType: filters.notificationType } : {}),
      deletedAt: null,
    };

    const rows = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map(mapRow);
  }

  async countByRecipient(organizationId: string, recipientUserId: string, filters: any) {
    const where = {
      ...this.tenantWhere({ organizationId }),
      recipientUserId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.notificationType ? { notificationType: filters.notificationType } : {}),
      deletedAt: null,
    };
    return prisma.notification.count({ where });
  }

  async findById(organizationId: string, id: string) {
    const row = await prisma.notification.findFirst({
      where: { id, ...this.tenantWhere({ organizationId }), deletedAt: null },
    });
    return row ? mapRow(row) : null;
  }

  async markRead(db: DbClient, organizationId: string, id: string) {
    const row = await db.notification.updateMany({
      where: { id, ...this.tenantWhere({ organizationId }), deletedAt: null },
      data: { status: "READ", readAt: new Date() },
    });
    return row.count > 0;
  }

  async markAllRead(db: DbClient, organizationId: string, recipientUserId: string) {
    const row = await db.notification.updateMany({
      where: { 
        ...this.tenantWhere({ organizationId }), 
        recipientUserId, 
        status: { not: "READ" },
        deletedAt: null 
      },
      data: { status: "READ", readAt: new Date() },
    });
    return row.count;
  }

  async countUnread(organizationId: string, recipientUserId: string) {
    return prisma.notification.count({
      where: {
        ...this.tenantWhere({ organizationId }),
        recipientUserId,
        status: { not: "READ" },
        deletedAt: null,
      },
    });
  }
}
