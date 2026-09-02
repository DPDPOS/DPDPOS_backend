import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import type { BaseDomainEvent } from "../../../events/types/base-event.interface.js";
import { renderCsv } from "../../../infrastructure/reporting/csv-renderer.js";
import { renderPdf } from "../../../infrastructure/reporting/pdf-renderer.js";
import type { ListAuditLogsQuery, ExportAuditDto } from "../dto/audit-query.dto.js";
import { resolveAuditCatalog } from "../domain/audit-catalog.js";
import type { AuditLogRecord } from "../dto/audit-response.dto.js";

function enrichRecord(row: AuditLogRecord) {
  const catalog = resolveAuditCatalog(row.actionType);
  return {
    ...row,
    entityType: row.entityType && row.entityType !== "unknown"
      ? row.entityType
      : catalog.entityType,
    description: catalog.description,
  };
}

export class AuditService {
  private repo = new AuditRepository();

  async logEvent(event: BaseDomainEvent) {
    try {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const entityId =
        (typeof payload.id === "string" && payload.id) ||
        (typeof payload.controlId === "string" && payload.controlId) ||
        (typeof payload.reportId === "string" && payload.reportId) ||
        null;

      const catalog = resolveAuditCatalog(event.eventType);
      const match = event.eventType.match(
        /^([A-Z][a-zA-Z0-9]+?)(Created|Updated|Deleted|Action)$/,
      );
      const entityType = catalog.entityType || (match ? match[1] : null);

      const beforeJson = payload.previous ?? null;
      let afterJson: unknown = null;
      if (beforeJson && payload.current) {
        afterJson = payload.current;
      } else {
        const { __client: _c, previous: _p, current: _cur, ...rest } = payload;
        afterJson = rest;
      }

      await this.repo.create(prisma, {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        actionType: event.eventType,
        entityType,
        entityId,
        beforeJson,
        afterJson,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        correlationId: event.correlationId,
      });
      logger.debug(
        { eventType: event.eventType, correlationId: event.correlationId },
        "audit.event_logged",
      );
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

    return { data: rows.map(enrichRecord), nextCursor };
  }

  async getEntityHistory(ctx: RequestContext, entityType: string, entityId: string) {
    const rows = await this.repo.findByEntity(ctx.organizationId, entityType, entityId);
    return rows.map(enrichRecord);
  }

  async exportAuditPack(ctx: RequestContext, filters: ExportAuditDto) {
    const rows = await this.repo.findByOrg(ctx.organizationId, filters, undefined, 10000);
    const exportRows = rows.map((row) => {
      const catalog = resolveAuditCatalog(row.actionType);
      return {
        date: row.createdAt.toISOString(),
        action: row.actionType,
        description: catalog.description,
        entityType: row.entityType ?? catalog.entityType,
        entityId: row.entityId,
        actorUserId: row.actorUserId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      };
    });
    return filters.format === "pdf" ? renderPdf(exportRows) : renderCsv(exportRows);
  }
}

export const auditService = new AuditService();
