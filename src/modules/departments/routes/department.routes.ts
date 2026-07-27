import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { departmentController } from "../controllers/department.controller.js";
import { departmentPermissions } from "../permissions/department.permissions.js";

export function createDepartmentsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(departmentPermissions.read),
    (req, res, next) => void departmentController.stub(req, res, next),
  );
  router.post(
    "/",
    authenticate,
    requirePermission(departmentPermissions.create),
    (req, res, next) => void departmentController.stub(req, res, next),
  );

  return router;
}
