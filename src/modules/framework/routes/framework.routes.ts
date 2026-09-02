import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { frameworkController } from "../controllers/framework.controller.js";
import { frameworkPermissions } from "../permissions/framework.permissions.js";
import {
  generateFrameworkDtoSchema,
  publishFrameworkDtoSchema,
  regenerateFrameworkDtoSchema,
  roadmapQuerySchema,
} from "../dto/framework.dto.js";

export function createFrameworkRouter(): Router {
  const router = Router();

  router.post(
    "/generate",
    authenticate,
    requirePermission(frameworkPermissions.generate),
    validateBody(generateFrameworkDtoSchema),
    (req, res, next) => void frameworkController.generate(req, res, next),
  );

  router.get(
    "/roadmap",
    authenticate,
    requirePermission(frameworkPermissions.read),
    validateQuery(roadmapQuerySchema),
    (req, res, next) => void frameworkController.roadmap(req, res, next),
  );

  router.post(
    "/publish",
    authenticate,
    requirePermission(frameworkPermissions.publish),
    validateBody(publishFrameworkDtoSchema),
    (req, res, next) => void frameworkController.publish(req, res, next),
  );

  router.post(
    "/regenerate",
    authenticate,
    requirePermission(frameworkPermissions.generate),
    validateBody(regenerateFrameworkDtoSchema),
    (req, res, next) => void frameworkController.regenerate(req, res, next),
  );

  router.post(
    "/regenerate/preview",
    authenticate,
    requirePermission(frameworkPermissions.generate),
    validateBody(regenerateFrameworkDtoSchema),
    (req, res, next) => void frameworkController.previewRegenerate(req, res, next),
  );

  return router;
}
