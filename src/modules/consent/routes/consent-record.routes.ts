import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { consentRecordController } from "../controllers/consent-record.controller.js";
import { consentRecordPermissions } from "../permissions/consent-record.permissions.js";

import {
  createConsentRecordDtoSchema,
  consentRecordIdParamSchema,
  listConsentRecordsQuerySchema,
} from "../dto/consent-record.dto.js";

export function createConsentRecordRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(consentRecordPermissions.create),
    validateBody(createConsentRecordDtoSchema),
    (req, res, next) =>
      void consentRecordController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(consentRecordPermissions.read),
    validateQuery(listConsentRecordsQuerySchema),
    (req, res, next) =>
      void consentRecordController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(consentRecordPermissions.read),
    validateParams(consentRecordIdParamSchema),
    (req, res, next) =>
      void consentRecordController.getById(req, res, next),
  );

  router.post(
    "/:id/withdraw",
    authenticate,
    requirePermission(consentRecordPermissions.withdraw),
    validateParams(consentRecordIdParamSchema),
    (req, res, next) =>
      void consentRecordController.withdraw(req, res, next),
  );

  return router;
}
