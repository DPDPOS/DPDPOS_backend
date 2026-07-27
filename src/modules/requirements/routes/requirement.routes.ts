import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { requirementController } from "../controllers/requirement.controller.js";
import { requirementPermissions } from "../permissions/requirement.permissions.js";

export function createRequirementsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(requirementPermissions.read),
    (req, res, next) => void requirementController.stub(req, res, next),
  );
  router.post(
    "/",
    authenticate,
    requirePermission(requirementPermissions.create),
    (req, res, next) => void requirementController.stub(req, res, next),
  );

  return router;
}
