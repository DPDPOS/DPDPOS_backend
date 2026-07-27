import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { userController } from "../controllers/user.controller.js";
import { userPermissions } from "../permissions/user.permissions.js";

export function createUsersRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(userPermissions.read),
    (req, res, next) => void userController.stub(req, res, next),
  );
  router.post(
    "/",
    authenticate,
    requirePermission(userPermissions.create),
    (req, res, next) => void userController.stub(req, res, next),
  );
  router.patch(
    "/:id",
    authenticate,
    requirePermission(userPermissions.update),
    (req, res, next) => void userController.stub(req, res, next),
  );

  return router;
}
