import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { auditController } from "../controllers/audit.controller.js";
import { auditPermissions } from "../permissions/audit.permissions.js";
import { listAuditLogsQuerySchema, auditEntityParamsSchema, exportAuditDtoSchema } from "../dto/audit-query.dto.js";

export function createAuditRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(auditPermissions.read),
    validateQuery(listAuditLogsQuerySchema),
    (req, res, next) => void auditController.search(req, res, next)
  );

  router.get(
    "/entity/:entityType/:entityId",
    authenticate,
    requirePermission(auditPermissions.read),
    validateParams(auditEntityParamsSchema),
    (req, res, next) => void auditController.getEntityHistory(req, res, next)
  );

  router.post(
    "/export",
    authenticate,
    requirePermission(auditPermissions.export),
    validateBody(exportAuditDtoSchema),
    (req, res, next) => void auditController.exportPack(req, res, next)
  );

  return router;
}
