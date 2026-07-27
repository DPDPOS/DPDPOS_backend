import { Router } from "express";
import {
  validateBody,
  validateParams,
} from "../../../shared/middleware/validate.middleware.js";
import { organizationController } from "../controllers/organization.controller.js";
import {
  createOrganizationDtoSchema,
  organizationIdParamSchema,
  updateOrganizationDtoSchema,
} from "../dto/organization.dto.js";

export function createOrganizationsRouter(): Router {
  const router = Router();

  router.post(
    "/",
    validateBody(createOrganizationDtoSchema),
    (req, res, next) => void organizationController.create(req, res, next),
  );

  router.get(
    "/:id",
    validateParams(organizationIdParamSchema),
    (req, res, next) => void organizationController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    validateParams(organizationIdParamSchema),
    validateBody(updateOrganizationDtoSchema),
    (req, res, next) => void organizationController.update(req, res, next),
  );

  return router;
}
