import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { processingActivityController } from "../controllers/processing-activity.controller.js";

import {
  createProcessingActivityDtoSchema,
  updateProcessingActivityDtoSchema,
  processingActivityIdParamSchema,
  listProcessingActivitiesQuerySchema,
} from "../dto/processing-activity.dto.js";

import { processingActivityPermissions } from "../permissions/processing-activity.permissions.js";

export function createProcessingActivityRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(processingActivityPermissions.create),
    validateBody(createProcessingActivityDtoSchema),
    (req, res, next) =>
      void processingActivityController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(processingActivityPermissions.read),
    validateQuery(listProcessingActivitiesQuerySchema),
    (req, res, next) =>
      void processingActivityController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(processingActivityPermissions.read),
    validateParams(processingActivityIdParamSchema),
    (req, res, next) =>
      void processingActivityController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(processingActivityPermissions.update),
    validateParams(processingActivityIdParamSchema),
    validateBody(updateProcessingActivityDtoSchema),
    (req, res, next) =>
      void processingActivityController.update(req, res, next),
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(processingActivityPermissions.delete),
    validateParams(processingActivityIdParamSchema),
    (req, res, next) =>
      void processingActivityController.softDelete(req, res, next),
  );

  return router;
}
