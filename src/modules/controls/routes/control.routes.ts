import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { controlController } from "../controllers/control.controller.js";
import { controlPermissions } from "../permissions/control.permissions.js";
import {
  controlIdParamsSchema,
  createControlDtoSchema,
  listControlsQuerySchema,
  updateControlDtoSchema,
} from "../dto/control.dto.js";

export function createControlsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(controlPermissions.read),
    validateQuery(listControlsQuerySchema),
    (req, res, next) => void controlController.list(req, res, next),
  );

  router.post(
    "/",
    authenticate,
    requirePermission(controlPermissions.create),
    validateBody(createControlDtoSchema),
    (req, res, next) => void controlController.create(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(controlPermissions.update),
    validateParams(controlIdParamsSchema),
    validateBody(updateControlDtoSchema),
    (req, res, next) => void controlController.update(req, res, next),
  );

  return router;
}
