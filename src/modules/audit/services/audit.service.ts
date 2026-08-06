import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";
import { renderCsv } from "../../../infrastructure/reporting/csv-renderer.js";
import { renderPdf } from "../../../infrastructure/reporting/pdf-renderer.js";
import type { ListAuditLogsQuery, ExportAuditDto } from "../dto/audit-query.dto.js";

export class AuditService {
  private repo = new AuditRepository();

  async logEvent(event: BaseDomainEvent) {
    try {
      const entityId = (event.payload as any)?.id || null;
      const match = event.eventType.match(/^([A-Z][a-zA-Z0-9]+)(Created|Updated|Deleted|Action)$/);
      const entityType = match ? match[1] : null;
      
      const beforeJson = (event.payload as any)?.previous || null;
      let afterJson = null;
      if (beforeJson && (event.payload as any)?.current) {
        afterJson = (event.payload as any)?.current;
      } else {
        afterJson = event.payload;
      }

      await this.repo.create(prisma, {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        actionType: event.eventType,
        entityType,
        entityId,
        beforeJson,
        afterJson,
        correlationId: event.correlationId,
      });
      logger.debug({ eventType: event.eventType, correlationId: event.correlationId }, "audit.event_logged");
    } catch (err) {
      logger.error({ err, eventType: event.eventType }, "audit.failed_to_log_event");
    }
  }

  async search(ctx: RequestContext, query: ListAuditLogsQuery) {
    const { cursor, limit, ...filters } = query;
    const rows = await this.repo.findByOrg(ctx.organizationId, filters, cursor, limit);
    
    let nextCursor = null;
    if (rows.length > limit) {
      const nextItem = rows.pop();
      nextCursor = nextItem?.id;
    }

    return { data: rows, nextCursor };
  }

  async getEntityHistory(ctx: RequestContext, entityType: string, entityId: string) {
    return this.repo.findByEntity(ctx.organizationId, entityType, entityId);
  }

  async exportAuditPack(ctx: RequestContext, filters: ExportAuditDto) {
    const rows = await this.repo.findByOrg(ctx.organizationId, filters, undefined, 10000);
    const exportRows = rows.map((row) => ({
      date: row.createdAt.toISOString(),
      action: row.actionType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
    }));
    return filters.format === "pdf" ? renderPdf(exportRows) : renderCsv(exportRows);
  }
}

export const auditService = new AuditService();
