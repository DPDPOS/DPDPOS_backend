import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import {
  validateBody,
  validateParams,
} from "../../../shared/middleware/validate.middleware.js";
import { agentController } from "../controllers/agent.controller.js";
import {
  agentIdParamSchema,
  discoverySchema,
  enrollAgentSchema,
  heartbeatSchema,
  rotateCertificateSchema,
  taskIdParamSchema,
  taskResultSchema,
} from "../dto/agent.dto.js";
import { authenticateAgent } from "../middleware/authenticate-agent.middleware.js";
import { agentsPermissions } from "../permissions/agents.permissions.js";

export function createAgentRouter(): Router {
  const router = Router();

  router.post(
    "/enroll",
    validateBody(enrollAgentSchema),
    (req, res, next) => void agentController.enroll(req, res, next),
  );
  router.post(
    "/heartbeat",
    authenticateAgent,
    validateBody(heartbeatSchema),
    (req, res, next) => void agentController.heartbeat(req, res, next),
  );
  router.post(
    "/rotate-cert",
    authenticateAgent,
    validateBody(rotateCertificateSchema),
    (req, res, next) => void agentController.rotateCertificate(req, res, next),
  );
  router.get(
    "/plugins/manifest",
    authenticateAgent,
    (req, res, next) => void agentController.pluginManifest(req, res, next),
  );
  router.post(
    "/discovery",
    authenticateAgent,
    validateBody(discoverySchema),
    (req, res, next) => void agentController.discovery(req, res, next),
  );
  router.post(
    "/tasks/:taskId/result",
    authenticateAgent,
    validateParams(taskIdParamSchema),
    validateBody(taskResultSchema),
    (req, res, next) => void agentController.submitTaskResult(req, res, next),
  );
  router.get(
    "/consent/snapshot",
    authenticateAgent,
    (req, res, next) => void agentController.consentSnapshot(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(agentsPermissions.read),
    (req, res, next) => void agentController.list(req, res, next),
  );
  router.get(
    "/:id",
    authenticate,
    requirePermission(agentsPermissions.read),
    validateParams(agentIdParamSchema),
    (req, res, next) => void agentController.get(req, res, next),
  );
  router.post(
    "/:id/revoke",
    authenticate,
    requirePermission(agentsPermissions.manage),
    validateParams(agentIdParamSchema),
    (req, res, next) => void agentController.revoke(req, res, next),
  );

  return router;
}
