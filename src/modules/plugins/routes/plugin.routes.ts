import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { authenticateAgent } from "../../agents/middleware/authenticate-agent.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { validateBody, validateParams } from "../../../shared/middleware/validate.middleware.js";
import { pluginController } from "../controllers/plugin.controller.js";
import { pluginArtifactParamsSchema, publishPluginSchema } from "../dto/plugin.dto.js";

export function createPluginRouter(): Router {
  const router = Router();
  router.post(
    "/",
    authenticate,
    requirePermission(PERMISSIONS.PLUGIN_MANAGE),
    validateBody(publishPluginSchema),
    (req, res, next) => void pluginController.publish(req, res, next),
  );
  router.get(
    "/",
    authenticate,
    requirePermission(PERMISSIONS.PLUGIN_READ),
    (req, res, next) => void pluginController.list(req, res, next),
  );
  router.get(
    "/:id.wasm",
    authenticateAgent,
    validateParams(pluginArtifactParamsSchema),
    (req, res, next) => void pluginController.download(req, res, next),
  );
  return router;
}
