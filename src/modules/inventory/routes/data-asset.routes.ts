import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { ValidationError } from "../../../shared/errors/app-error.js";

import { dataAssetController } from "../controllers/data-asset.controller.js";
import { dataAssetPermissions } from "../permissions/data-asset.permissions.js";
import {
  createDataAssetDtoSchema,
  updateDataAssetDtoSchema,
  dataAssetIdParamSchema,
} from "../dto/data-asset.dto.js";
import { inventoryOpsService } from "../services/inventory-ops.service.js";

const createLinkSchema = z.object({
  fromAssetId: z.string().uuid(),
  toAssetId: z.string().uuid(),
  linkType: z.enum(["FEEDS", "DERIVES", "COPIES"]),
  notes: z.string().trim().max(2000).optional(),
});

const linkIdParam = z.object({ id: z.string().uuid() });
const listLinksQuery = z.object({
  assetId: z.string().uuid().optional(),
});

const importBodySchema = z.object({
  /** Base64-encoded .xlsx workbook. */
  fileBase64: z.string().min(1).max(8_000_000),
});

export function createDataAssetRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(dataAssetPermissions.create),
    validateBody(createDataAssetDtoSchema),
    (req, res, next) => void dataAssetController.create(req, res, next),
  );

  router.get(
    "/import/template",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    async (_req, res, next) => {
      try {
        const buf = await inventoryOpsService.buildImportTemplate();
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="data-assets-template.xlsx"',
        );
        res.status(200).send(buf);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/import",
    authenticate,
    requirePermission(dataAssetPermissions.create),
    validateBody(importBodySchema),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        const { fileBase64 } = req.body as z.infer<typeof importBodySchema>;
        let buffer: Buffer;
        try {
          buffer = Buffer.from(fileBase64, "base64");
        } catch {
          throw new ValidationError("fileBase64 must be valid base64");
        }
        if (buffer.length < 32) {
          throw new ValidationError("Uploaded workbook is empty or invalid");
        }
        const result = await inventoryOpsService.importFromExcel(ctx, buffer);
        sendSuccess(res, result, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/links",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    validateQuery(listLinksQuery),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        const assetId = (req.query as { assetId?: string }).assetId;
        sendSuccess(res, await inventoryOpsService.listLinks(ctx, assetId));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/links",
    authenticate,
    requirePermission(dataAssetPermissions.update),
    validateBody(createLinkSchema),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        const link = await inventoryOpsService.createLink(
          ctx,
          req.body as z.infer<typeof createLinkSchema>,
        );
        sendSuccess(res, link, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    "/links/:id",
    authenticate,
    requirePermission(dataAssetPermissions.update),
    validateParams(linkIdParam),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        sendSuccess(
          res,
          await inventoryOpsService.deleteLink(ctx, req.params.id as string),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/suggest-sensitivity",
    authenticate,
    requirePermission(dataAssetPermissions.update),
    validateParams(dataAssetIdParamSchema),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        sendSuccess(
          res,
          await inventoryOpsService.suggestSensitivity(
            ctx,
            req.params.id as string,
          ),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    (req, res, next) => void dataAssetController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    validateParams(dataAssetIdParamSchema),
    (req, res, next) => void dataAssetController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.update),
    validateParams(dataAssetIdParamSchema),
    validateBody(updateDataAssetDtoSchema),
    (req, res, next) => void dataAssetController.update(req, res, next),
  );

  router.delete(
    "/:id",
    authenticate,
    requirePermission(dataAssetPermissions.delete),
    validateParams(dataAssetIdParamSchema),
    (req, res, next) => void dataAssetController.archive(req, res, next),
  );

  return router;
}

export function createInventoryDataFlowsRouter(): Router {
  const router = Router();
  router.get(
    "/data-flows",
    authenticate,
    requirePermission(dataAssetPermissions.read),
    async (req, res, next) => {
      try {
        const ctx = getRequestContext(req as AuthenticatedRequest);
        sendSuccess(res, await inventoryOpsService.getDataFlows(ctx));
      } catch (err) {
        next(err);
      }
    },
  );
  return router;
}
