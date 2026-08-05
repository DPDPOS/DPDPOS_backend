import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import { NotificationRepository } from "../repositories/notification.repository.js";
import { renderTemplate } from "../domain/notification-templates.js";
import { SYSTEM_ACTOR_ID } from "../../../shared/constants/system-actor.js";
import type { ListNotificationsQuery } from "../dto/notification.dto.js";
import type { UpdatePreferencesDto } from "../dto/notification.dto.js";
import { getRedis, connectRedis } from "../../../infrastructure/cache/redis-client.js";
import { notificationQueue } from "../../../jobs/queues/notification.queue.js";

const DEFAULT_PREFERENCES = { email: false, inApp: true, slack: false };

export class NotificationService {
  private repo = new NotificationRepository();

  async send(ctx: RequestContext, recipientUserId: string, notificationType: string, templateVars: Record<string, string | number>, relatedEntity?: { type: string, id: string }) {
    const preferences = await this.getPreferencesFor(ctx.organizationId, recipientUserId);
    const channel = preferences.inApp ? "IN_APP" : preferences.email ? "EMAIL" : preferences.slack ? "SLACK" : null;
    if (!channel) return { suppressed: true };
    const row = await withTransaction(async (tx) => {
      const { subject, body } = renderTemplate(notificationType, templateVars);
      
      const row = await this.repo.create(tx, ctx, {
        recipientUserId,
        notificationType,
        channel,
        subject,
        body,
        status: "PENDING",
        relatedEntityType: relatedEntity?.type,
        relatedEntityId: relatedEntity?.id,
        retryCount: 0,
      });

      return row;
    });
    await notificationQueue.add("deliver-notification", { notificationId: row.id }, {
      jobId: `notification-${row.id}`,
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return row;
  }

  async sendForEvent(event: any, recipientUserId: string, notificationType: string, templateVars: Record<string, string | number>, relatedEntity?: { type: string, id: string }) {
    const ctx: RequestContext = {
      organizationId: event.organizationId,
      actorUserId: SYSTEM_ACTOR_ID,
      correlationId: event.correlationId || crypto.randomUUID(),
      permissions: [],
      roles: [],
    };
    return this.send(ctx, recipientUserId, notificationType, templateVars, relatedEntity);
  }

  async list(ctx: RequestContext, query: ListNotificationsQuery) {
    const { page, pageSize, ...filters } = query;
    const items = await this.repo.findByRecipient(ctx.organizationId, ctx.actorUserId, filters, page, pageSize);
    const total = await this.repo.countByRecipient(ctx.organizationId, ctx.actorUserId, filters);
    
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    };
  }

  async getUnreadCount(ctx: RequestContext) {
    const count = await this.repo.countUnread(ctx.organizationId, ctx.actorUserId);
    return { count };
  }

  async markRead(ctx: RequestContext, notificationId: string) {
    return withTransaction(async (tx) => {
      const updated = await this.repo.markRead(tx, ctx.organizationId, notificationId);
      if (!updated) {
        throw new NotFoundError("Notification not found");
      }
      return { success: true };
    });
  }

  async markAllRead(ctx: RequestContext) {
    return withTransaction(async (tx) => {
      const count = await this.repo.markAllRead(tx, ctx.organizationId, ctx.actorUserId);
      return { updatedCount: count };
    });
  }

  async getPreferences(ctx: RequestContext) {
    return this.getPreferencesFor(ctx.organizationId, ctx.actorUserId);
  }

  private async getPreferencesFor(organizationId: string, userId: string) {
    const redis = getRedis();
    if (redis.status === "wait" || redis.status === "end") await connectRedis();
    const saved = await redis.get(this.preferenceKey(organizationId, userId));
    return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
  }

  async updatePreferences(ctx: RequestContext, preferences: UpdatePreferencesDto) {
    const merged = { ...await this.getPreferences(ctx), ...preferences };
    await getRedis().set(this.preferenceKey(ctx.organizationId, ctx.actorUserId), JSON.stringify(merged));
    return merged;
  }

  private preferenceKey(organizationId: string, userId: string) {
    return `notification-preferences:${organizationId}:${userId}`;
  }
}

export const notificationService = new NotificationService();
