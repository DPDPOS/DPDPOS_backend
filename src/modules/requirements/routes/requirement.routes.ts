import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirementController } from "../controllers/requirement.controller.js";
import { requirementPermissions } from "../permissions/requirement.permissions.js";
import {
  createRequirementDtoSchema,
  listRequirementsQuerySchema,
  mapRequirementDtoSchema,
  requirementIdParamsSchema,
  updateRequirementDtoSchema,
} from "../dto/requirement.dto.js";

export function createRequirementsRouter(): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    requirePermission(requirementPermissions.read),
    validateQuery(listRequirementsQuerySchema),
    (req, res, next) => void requirementController.list(req, res, next),
  );

  router.post(
    "/",
    authenticate,
    requirePermission(requirementPermissions.create),
    validateBody(createRequirementDtoSchema),
    (req, res, next) => void requirementController.create(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(requirementPermissions.read),
    validateParams(requirementIdParamsSchema),
    (req, res, next) => void requirementController.getById(req, res, next),
  );

  router.get(
    "/:id/evidence",
    authenticate,
    requirePermission(requirementPermissions.read),
    validateParams(requirementIdParamsSchema),
    (req, res, next) => void requirementController.getEvidence(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(requirementPermissions.update),
    validateParams(requirementIdParamsSchema),
    validateBody(updateRequirementDtoSchema),
    (req, res, next) => void requirementController.update(req, res, next),
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(requirementPermissions.delete),
    validateParams(requirementIdParamsSchema),
    (req, res, next) => void requirementController.delete(req, res, next),
  );

  // Map an existing requirement onto a control (RequirementMapped outbox).
  router.post(
    "/:id/map",
    authenticate,
    requirePermission(requirementPermissions.create),
    validateParams(requirementIdParamsSchema),
    validateBody(mapRequirementDtoSchema),
    (req, res, next) => void requirementController.map(req, res, next),
  );

  return router;
}
