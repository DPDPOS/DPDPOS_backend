import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { roleController } from "../controllers/role.controller.js";
import { rolePermissions } from "../permissions/role.permissions.js";

export function createRolesRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(rolePermissions.read),
    (req, res, next) => void roleController.stub(req, res, next),
  );
  router.post(
    "/",
    authenticate,
    requirePermission(rolePermissions.create),
    (req, res, next) => void roleController.stub(req, res, next),
  );
  router.patch(
    "/:id/permissions",
    authenticate,
    requirePermission(rolePermissions.updatePermissions),
    (req, res, next) => void roleController.stub(req, res, next),
  );

  return router;
}
