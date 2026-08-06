import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { evidenceController } from "../controllers/evidence.controller.js";
import { evidencePermissions } from "../permissions/evidence.permissions.js";
import {
  createEvidenceDtoSchema,
  confirmUploadDtoSchema,
  tagEvidenceDtoSchema,
  mapEvidenceDtoSchema,
  evidenceIdParamSchema,
  listEvidenceQuerySchema
  ,exportEvidenceDtoSchema
} from "../dto/evidence.dto.js";

export function createEvidenceRouter(): Router {
  const router = Router();

  router.post("/", authenticate, requirePermission(evidencePermissions.create), validateBody(createEvidenceDtoSchema),
    (req, res, next) => void evidenceController.initiateUpload(req, res, next));

  router.patch("/:id/confirm", authenticate, requirePermission(evidencePermissions.create), validateParams(evidenceIdParamSchema), validateBody(confirmUploadDtoSchema),
    (req, res, next) => void evidenceController.confirmUpload(req, res, next));

  router.get("/", authenticate, requirePermission(evidencePermissions.read), validateQuery(listEvidenceQuerySchema),
    (req, res, next) => void evidenceController.list(req, res, next));

  router.get("/:id", authenticate, requirePermission(evidencePermissions.read), validateParams(evidenceIdParamSchema),
    (req, res, next) => void evidenceController.getById(req, res, next));

  router.get("/:id/download", authenticate, requirePermission(evidencePermissions.read), validateParams(evidenceIdParamSchema),
    (req, res, next) => void evidenceController.getDownloadUrl(req, res, next));

  router.patch("/:id/tag", authenticate, requirePermission(evidencePermissions.create), validateParams(evidenceIdParamSchema), validateBody(tagEvidenceDtoSchema),
    (req, res, next) => void evidenceController.tagEvidence(req, res, next));

  router.patch("/:id/map", authenticate, requirePermission(evidencePermissions.create), validateParams(evidenceIdParamSchema), validateBody(mapEvidenceDtoSchema),
    (req, res, next) => void evidenceController.mapToControl(req, res, next));

  router.patch("/:id/submit-review", authenticate, requirePermission(evidencePermissions.create), validateParams(evidenceIdParamSchema),
    (req, res, next) => void evidenceController.submitForReview(req, res, next));

  router.patch("/:id/approve", authenticate, requirePermission(evidencePermissions.approve), validateParams(evidenceIdParamSchema),
    (req, res, next) => void evidenceController.approve(req, res, next));

  router.patch("/:id/lock", authenticate, requirePermission(evidencePermissions.approve), validateParams(evidenceIdParamSchema),
    (req, res, next) => void evidenceController.lock(req, res, next));

  router.post("/export", authenticate, requirePermission(evidencePermissions.export), validateBody(exportEvidenceDtoSchema),
    (req, res, next) => void evidenceController.exportPack(req, res, next));

  return router;
}
