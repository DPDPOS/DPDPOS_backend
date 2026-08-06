import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { validationRunController } from "../controllers/validation-run.controller.js";
import { validationPermissions } from "../permissions/validation.permissions.js";

import {
  createValidationRunDtoSchema,
  listValidationRunsQuerySchema,
  validationRunIdParamSchema,
} from "../dto/validation-run.dto.js";

export function createValidationRunRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(validationPermissions.run),
    validateBody(createValidationRunDtoSchema),
    (req, res, next) =>
      void validationRunController.trigger(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(validationPermissions.read),
    validateQuery(listValidationRunsQuerySchema),
    (req, res, next) =>
      void validationRunController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(validationPermissions.read),
    validateParams(validationRunIdParamSchema),
    (req, res, next) =>
      void validationRunController.getById(req, res, next),
  );

  return router;
}
