import type { NextFunction, Response } from "express";
import { X509Certificate } from "node:crypto";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type {
  DiscoveryDto,
  EnrollAgentDto,
  HeartbeatDto,
  TaskResultDto,
} from "../dto/agent.dto.js";
import {
  getAgentContext,
} from "../middleware/authenticate-agent.middleware.js";
import {
  type AgentAuthenticatedRequest,
  type AgentPrismaClient,
} from "../types/agent.types.js";
import { enrollmentService } from "../services/enrollment.service.js";
import { heartbeatService } from "../services/heartbeat.service.js";
import { platformCaService } from "../services/platform-ca.service.js";
import { taskDispatchService } from "../services/task-dispatch.service.js";
import { agentRegistryService } from "../services/agent-registry.service.js";
import { catalogIngestionService } from "../../../control-plane/catalog-ingestion.service.js";
import { consentSnapshotService } from "../services/consent-snapshot.service.js";
import { pluginRegistryService } from "../../plugins/services/plugin-registry.service.js";
import { ValidationError } from "../../../shared/errors/app-error.js";

export class AgentController {
  async enroll(req: AgentAuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await enrollmentService.enroll(req.body as EnrollAgentDto), 201);
    } catch (error) {
      next(error);
    }
  }

  async heartbeat(req: AgentAuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(
        res,
        await heartbeatService.record(getAgentContext(req), req.body as HeartbeatDto),
      );
    } catch (error) {
      next(error);
    }
  }

  async rotateCertificate(
    req: AgentAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getAgentContext(req);
      const signed = await platformCaService.signCsr((req.body as { csrPem: string }).csrPem);
      await prisma.$transaction(async (tx) => {
        const db = tx as unknown as AgentPrismaClient;
        const replacement = await db.agentCertificate.create({
          data: {
            agentId: ctx.agentId,
            serialNumber: signed.serialNumber,
            fingerprintSha256: new X509Certificate(signed.certPem)
              .fingerprint256.replaceAll(":", "")
              .toLowerCase(),
            certificatePem: signed.certPem,
            issuedAt: new Date(),
            expiresAt: signed.expiresAt,
          },
        });
        await db.agentCertificate.updateMany({
          where: {
            agentId: ctx.agentId,
            revokedAt: null,
            id: { not: replacement.id },
          },
          data: { revokedAt: new Date(), replacedById: replacement.id },
        });
      });
      sendSuccess(res, {
        clientCertPem: signed.certPem,
        caCertPem: await platformCaService.getCaCertPem(),
        expiresAt: signed.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  }

  async pluginManifest(
    req: AgentAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getAgentContext(req);
      sendSuccess(res, await pluginRegistryService.getManifestForOrg(ctx.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async discovery(req: AgentAuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getAgentContext(req);
      const input = req.body as DiscoveryDto;
      sendSuccess(
        res,
        await catalogIngestionService.ingestDiscoveryReport(ctx, input),
        202,
      );
    } catch (error) {
      next(error);
    }
  }

  async submitTaskResult(
    req: AgentAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      sendSuccess(
        res,
        await taskDispatchService.submitTaskResult(
          getAgentContext(req),
          req.params.taskId as string,
          req.body as TaskResultDto,
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async consentSnapshot(
    req: AgentAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getAgentContext(req);
      const sinceValue = typeof req.query.since === "string" ? req.query.since : undefined;
      const since = sinceValue ? new Date(sinceValue) : undefined;
      if (since && Number.isNaN(since.getTime())) {
        throw new ValidationError("since must be a valid ISO date");
      }
      sendSuccess(
        res,
        await consentSnapshotService.getSnapshot(ctx.organizationId, since),
      );
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await agentRegistryService.listAgents(req.context!));
    } catch (error) {
      next(error);
    }
  }

  async get(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await agentRegistryService.getAgent(req.context!, req.params.id as string));
    } catch (error) {
      next(error);
    }
  }

  async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await agentRegistryService.revokeAgent(req.context!, req.params.id as string));
    } catch (error) {
      next(error);
    }
  }
}

export const agentController = new AgentController();
