import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { organizationController } from "../controllers/organization.controller.js";
import { organizationPermissions } from "../permissions/organization.permissions.js";
import {
  createOrganizationDtoSchema,
  organizationIdParamSchema,
  updateOrganizationDtoSchema,
} from "../dto/organization.dto.js";

export function createOrganizationsRouter(): Router {
  const router = Router();

  // Bootstrap onboarding — public until platform-admin auth exists.
  router.post(
    "/",
    validateBody(createOrganizationDtoSchema),
    (req, res, next) => void organizationController.create(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(organizationPermissions.read),
    validateParams(organizationIdParamSchema),
    (req, res, next) => void organizationController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(organizationPermissions.update),
    validateParams(organizationIdParamSchema),
    validateBody(updateOrganizationDtoSchema),
    (req, res, next) => void organizationController.update(req, res, next),
  );

  return router;
}
