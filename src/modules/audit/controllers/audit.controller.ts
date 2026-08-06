import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import { auditService } from "../services/audit.service.js";
import type { ListAuditLogsQuery, ExportAuditDto } from "../dto/audit-query.dto.js";

export class AuditController {
  async search(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListAuditLogsQuery;
      const data = await auditService.search(ctx, query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async getEntityHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { entityType, entityId } = (req as ValidatedRequest).validatedParams as { entityType: string; entityId: string };
      const data = await auditService.getEntityHistory(ctx, entityType, entityId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async exportPack(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const body = ((req as ValidatedRequest).validatedBody ?? {}) as ExportAuditDto;
      const artifact = await auditService.exportAuditPack(ctx, body);
      const isPdf = body.format === "pdf";
      res.setHeader("Content-Type", isPdf ? "application/pdf" : "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-export.${isPdf ? "pdf" : "csv"}"`);
      res.status(200).send(artifact);
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
