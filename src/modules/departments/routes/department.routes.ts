import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { departmentController } from "../controllers/department.controller.js";
import { departmentPermissions } from "../permissions/department.permissions.js";
import {
  createDepartmentDtoSchema,
  listDepartmentsQuerySchema,
} from "../dto/department.dto.js";

export function createDepartmentsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(departmentPermissions.read),
    validateQuery(listDepartmentsQuerySchema),
    (req, res, next) => void departmentController.list(req, res, next),
  );

  router.post(
    "/",
    authenticate,
    requirePermission(departmentPermissions.create),
    validateBody(createDepartmentDtoSchema),
    (req, res, next) => void departmentController.create(req, res, next),
  );

  return router;
}
