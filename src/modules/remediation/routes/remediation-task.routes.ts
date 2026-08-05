import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { remediationTaskController } from "../controllers/remediation-task.controller.js";
import { remediationTaskPermissions } from "../permissions/remediation-task.permissions.js";

import { createRemediationTaskDtoSchema } from "../dto/create-remediation-task.dto.js";
import { updateRemediationTaskDtoSchema } from "../dto/update-remediation-task.dto.js";
import {
  remediationTaskIdParamSchema,
  listRemediationTasksQuerySchema,
  closeRemediationTaskBodySchema,
} from "../dto/remediation-task.dto.js";

export function createRemediationTaskRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(remediationTaskPermissions.update),
    validateBody(createRemediationTaskDtoSchema),
    (req, res, next) => void remediationTaskController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(remediationTaskPermissions.read),
    validateQuery(listRemediationTasksQuerySchema),
    (req, res, next) => void remediationTaskController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(remediationTaskPermissions.read),
    validateParams(remediationTaskIdParamSchema),
    (req, res, next) => void remediationTaskController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(remediationTaskPermissions.update),
    validateParams(remediationTaskIdParamSchema),
    validateBody(updateRemediationTaskDtoSchema),
    (req, res, next) => void remediationTaskController.update(req, res, next),
  );

  router.post(
    "/:id/close",
    authenticate,
    requirePermission(remediationTaskPermissions.update),
    validateParams(remediationTaskIdParamSchema),
    validateBody(closeRemediationTaskBodySchema),
    (req, res, next) => void remediationTaskController.close(req, res, next),
  );

  return router;
}
