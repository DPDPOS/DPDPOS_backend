import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { validationRuleController } from "../controllers/validation-rule.controller.js";
import { validationPermissions } from "../permissions/validation.permissions.js";

import {
  createValidationRuleDtoSchema,
  updateValidationRuleDtoSchema,
  validationRuleIdParamSchema,
  listValidationRulesQuerySchema,
} from "../dto/validation-rule.dto.js";

export function createValidationRuleRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(validationPermissions.run),
    validateBody(createValidationRuleDtoSchema),
    (req, res, next) =>
      void validationRuleController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(validationPermissions.read),
    validateQuery(listValidationRulesQuerySchema),
    (req, res, next) =>
      void validationRuleController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(validationPermissions.read),
    validateParams(validationRuleIdParamSchema),
    (req, res, next) =>
      void validationRuleController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(validationPermissions.run),
    validateParams(validationRuleIdParamSchema),
    validateBody(updateValidationRuleDtoSchema),
    (req, res, next) =>
      void validationRuleController.update(req, res, next),
  );

  return router;
}
