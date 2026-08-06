import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody, validateParams } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { aiController } from "../controllers/ai.controller.js";
import { aiPermissions } from "../permissions/ai.permissions.js";
import { aiExplainDtoSchema, aiSummarizeDtoSchema, aiDraftDtoSchema, aiRequestIdParamSchema } from "../dto/ai.dto.js";

export function createAiRouter(): Router {
  const router = Router();
  router.post("/explain", authenticate, requirePermission(aiPermissions.explain), validateBody(aiExplainDtoSchema),
    (req, res, next) => void aiController.explain(req, res, next));
  router.post("/summarize", authenticate, requirePermission(aiPermissions.explain), validateBody(aiSummarizeDtoSchema),
    (req, res, next) => void aiController.summarize(req, res, next));
  router.post("/draft", authenticate, requirePermission(aiPermissions.draft), validateBody(aiDraftDtoSchema),
    (req, res, next) => void aiController.draft(req, res, next));
  router.get("/requests/:id", authenticate, requirePermission(aiPermissions.explain), validateParams(aiRequestIdParamSchema),
    (req, res, next) => void aiController.getResult(req, res, next));
  router.get("/usage", authenticate, requirePermission(aiPermissions.explain),
    (req, res, next) => void aiController.getUsageStats(req, res, next));
  return router;
}
