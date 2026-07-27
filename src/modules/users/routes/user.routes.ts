import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { userController } from "../controllers/user.controller.js";
import { userPermissions } from "../permissions/user.permissions.js";
import {
  createUserDtoSchema,
  listUsersQuerySchema,
  updateUserDtoSchema,
  userIdParamSchema,
} from "../dto/user.dto.js";

export function createUsersRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(userPermissions.read),
    validateQuery(listUsersQuerySchema),
    (req, res, next) => void userController.list(req, res, next),
  );

  // Invite flow — accepts user:create (wired) which covers invite onboarding.
  router.post(
    "/",
    authenticate,
    requirePermission(userPermissions.create),
    validateBody(createUserDtoSchema),
    (req, res, next) => void userController.invite(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(userPermissions.update),
    validateParams(userIdParamSchema),
    validateBody(updateUserDtoSchema),
    (req, res, next) => void userController.update(req, res, next),
  );

  return router;
}
