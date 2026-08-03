import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { dataAssetController } from "../controllers/data-asset.controller.js";

import {
  createDataAssetDtoSchema,
  updateDataAssetDtoSchema,
  dataAssetIdParamSchema,
} from "../dto/data-asset.dto.js";

export const dataAssetPermissions = {
  read: "DATA_ASSET_READ",
  create: "DATA_ASSET_CREATE",
  update: "DATA_ASSET_UPDATE",
  delete: "DATA_ASSET_DELETE",
} as const;

export function createDataAssetRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(dataAssetPermissions.create),
    validateBody(createDataAssetDtoSchema),
    (req, res, next) =>
      void dataAssetController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    (req, res, next) =>
      void dataAssetController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    validateParams(dataAssetIdParamSchema),
    (req, res, next) =>
      void dataAssetController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.update),
    validateParams(dataAssetIdParamSchema),
    validateBody(updateDataAssetDtoSchema),
    (req, res, next) =>
      void dataAssetController.update(req, res, next),
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.delete),
    validateParams(dataAssetIdParamSchema),
    (req, res, next) =>
      void dataAssetController.archive(req, res, next),
  );

  return router;
}