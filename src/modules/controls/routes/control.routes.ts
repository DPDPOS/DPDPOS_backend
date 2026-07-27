import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { controlController } from "../controllers/control.controller.js";
import { controlPermissions } from "../permissions/control.permissions.js";

export function createControlsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(controlPermissions.read),
    (req, res, next) => void controlController.stub(req, res, next),
  );
  router.post(
    "/",
    authenticate,
    requirePermission(controlPermissions.create),
    (req, res, next) => void controlController.stub(req, res, next),
  );
  router.patch(
    "/:id",
    authenticate,
    requirePermission(controlPermissions.update),
    (req, res, next) => void controlController.stub(req, res, next),
  );

  return router;
}
