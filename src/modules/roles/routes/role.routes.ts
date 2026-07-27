import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { roleController } from "../controllers/role.controller.js";
import { rolePermissions } from "../permissions/role.permissions.js";
import {
  createRoleDtoSchema,
  listRolesQuerySchema,
  roleIdParamSchema,
  updateRolePermissionsDtoSchema,
} from "../dto/role.dto.js";

export function createRolesRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(rolePermissions.read),
    validateQuery(listRolesQuerySchema),
    (req, res, next) => void roleController.list(req, res, next),
  );

  router.post(
    "/",
    authenticate,
    requirePermission(rolePermissions.create),
    validateBody(createRoleDtoSchema),
    (req, res, next) => void roleController.create(req, res, next),
  );

  router.patch(
    "/:id/permissions",
    authenticate,
    requirePermission(rolePermissions.updatePermissions),
    validateParams(roleIdParamSchema),
    validateBody(updateRolePermissionsDtoSchema),
    (req, res, next) => void roleController.updatePermissions(req, res, next),
  );

  return router;
}
