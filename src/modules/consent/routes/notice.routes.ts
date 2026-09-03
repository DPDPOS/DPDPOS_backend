import { Router } from "express";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";

import { noticeController } from "../controllers/notice.controller.js";
import { noticePermissions } from "../permissions/notice.permissions.js";

import {
  createNoticeDtoSchema,
  noticeDiffQuerySchema,
  noticeIdParamSchema,
} from "../dto/notice.dto.js";

export function createNoticeRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(noticePermissions.create),
    validateBody(createNoticeDtoSchema),
    (req, res, next) =>
      void noticeController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(noticePermissions.read),
    (req, res, next) =>
      void noticeController.list(req, res, next),
  );

  router.get(
    "/:id/diff",
    authenticate,
    requirePermission(noticePermissions.read),
    validateParams(noticeIdParamSchema),
    validateQuery(noticeDiffQuerySchema),
    (req, res, next) =>
      void noticeController.diff(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(noticePermissions.read),
    validateParams(noticeIdParamSchema),
    (req, res, next) =>
      void noticeController.getById(req, res, next),
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(noticePermissions.delete),
    validateParams(noticeIdParamSchema),
    (req, res, next) =>
      void noticeController.softDelete(req, res, next),
  );

  return router;
}
