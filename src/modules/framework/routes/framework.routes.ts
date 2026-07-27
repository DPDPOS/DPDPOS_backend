import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { frameworkController } from "../controllers/framework.controller.js";
import { frameworkPermissions } from "../permissions/framework.permissions.js";

export function createFrameworkRouter(): Router {
  const router = Router();

  router.post(
    "/generate",
    authenticate,
    requirePermission(frameworkPermissions.generate),
    (req, res, next) => void frameworkController.stub(req, res, next),
  );
  router.get(
    "/roadmap",
    authenticate,
    requirePermission(frameworkPermissions.read),
    (req, res, next) => void frameworkController.stub(req, res, next),
  );

  return router;
}
