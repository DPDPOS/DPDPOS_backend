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
import { agentIntakeController } from "../intake/agent-intake.controller.js";
import { agentIntakeSchema } from "../intake/agent-intake.dto.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

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

  // Org agent enrollment intake (moved from /onboarding)
  router.post(
    "/intake",
    authenticate,
    requirePermission(PERMISSIONS.ONBOARDING_INTAKE),
    validateBody(agentIntakeSchema),
    (req, res, next) => void agentIntakeController.intake(req, res, next),
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
