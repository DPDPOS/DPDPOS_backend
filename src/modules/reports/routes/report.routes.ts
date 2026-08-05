import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { reportController } from "../controllers/report.controller.js";
import { reportPermissions } from "../permissions/report.permissions.js";
import { generateReportDtoSchema, reportIdParamSchema, listReportsQuerySchema } from "../dto/report.dto.js";

export function createReportRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(reportPermissions.read),
    validateQuery(listReportsQuerySchema),
    (req, res, next) => void reportController.list(req, res, next)
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(reportPermissions.generate),
    validateParams(reportIdParamSchema),
    (req, res, next) => void reportController.cancel(req, res, next)
  );

  router.post(
    "/",
    authenticate,
    requirePermission(reportPermissions.generate),
    validateBody(generateReportDtoSchema),
    (req, res, next) => void reportController.create(req, res, next)
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(reportPermissions.read),
    validateParams(reportIdParamSchema),
    (req, res, next) => void reportController.getById(req, res, next)
  );

  router.get(
    "/:id/download",
    authenticate,
    requirePermission(reportPermissions.read),
    validateParams(reportIdParamSchema),
    (req, res, next) => void reportController.getDownloadUrl(req, res, next)
  );

  return router;
}
