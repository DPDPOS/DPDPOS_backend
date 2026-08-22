import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { dataSubjectRequestController } from "../controllers/data-subject-request.controller.js";
import { dataSubjectRequestPermissions } from "../permissions/data-subject-request.permissions.js";

import {
  createDataSubjectRequestDtoSchema,
  dataSubjectRequestIdParamSchema,
  listDataSubjectRequestsQuerySchema,
  updateDataSubjectRequestDtoSchema,
  startErasureDtoSchema,
  confirmErasureItemDtoSchema,
} from "../dto/data-subject-request.dto.js";

export function createDataSubjectRequestRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.create),
    validateBody(createDataSubjectRequestDtoSchema),
    (req, res, next) =>
      void dataSubjectRequestController.submit(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.read),
    validateQuery(listDataSubjectRequestsQuerySchema),
    (req, res, next) =>
      void dataSubjectRequestController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.read),
    validateParams(dataSubjectRequestIdParamSchema),
    (req, res, next) =>
      void dataSubjectRequestController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.update),
    validateParams(dataSubjectRequestIdParamSchema),
    validateBody(updateDataSubjectRequestDtoSchema),
    (req, res, next) =>
      void dataSubjectRequestController.update(req, res, next),
  );

  router.post(
    "/:id/erasure/start",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.update),
    validateParams(dataSubjectRequestIdParamSchema),
    validateBody(startErasureDtoSchema),
    (req, res, next) =>
      void dataSubjectRequestController.startErasure(req, res, next),
  );

  router.get(
    "/:id/erasure",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.read),
    validateParams(dataSubjectRequestIdParamSchema),
    (req, res, next) =>
      void dataSubjectRequestController.getErasure(req, res, next),
  );

  router.post(
    "/:id/erasure/confirm",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.update),
    validateParams(dataSubjectRequestIdParamSchema),
    validateBody(confirmErasureItemDtoSchema),
    (req, res, next) =>
      void dataSubjectRequestController.confirmErasureItem(req, res, next),
  );

  router.post(
    "/:id/erasure/complete",
    authenticate,
    requirePermission(dataSubjectRequestPermissions.update),
    validateParams(dataSubjectRequestIdParamSchema),
    (req, res, next) =>
      void dataSubjectRequestController.completeErasure(req, res, next),
  );

  return router;
}
