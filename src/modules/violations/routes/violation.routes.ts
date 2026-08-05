import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { violationController } from "../controllers/violation.controller.js";
import { violationPermissions } from "../permissions/violation.permissions.js";

import { createViolationDtoSchema } from "../dto/create-violation.dto.js";
import { updateViolationDtoSchema } from "../dto/update-violation.dto.js";
import {
  violationIdParamSchema,
  listViolationsQuerySchema,
  closeViolationBodySchema,
} from "../dto/violation.dto.js";

export function createViolationRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(violationPermissions.create),
    validateBody(createViolationDtoSchema),
    (req, res, next) => void violationController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(violationPermissions.read),
    validateQuery(listViolationsQuerySchema),
    (req, res, next) => void violationController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(violationPermissions.read),
    validateParams(violationIdParamSchema),
    (req, res, next) => void violationController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(violationPermissions.assign),
    validateParams(violationIdParamSchema),
    validateBody(updateViolationDtoSchema),
    (req, res, next) => void violationController.update(req, res, next),
  );

  router.post(
    "/:id/close",
    authenticate,
    requirePermission(violationPermissions.close),
    validateParams(violationIdParamSchema),
    validateBody(closeViolationBodySchema),
    (req, res, next) => void violationController.close(req, res, next),
  );

  return router;
}
