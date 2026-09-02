import type { NextFunction, Response } from "express";
import { UnauthorizedError } from "../../../shared/errors/app-error.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import { extractBearerToken } from "../../auth/utils/jwt.js";
import {
  agentDb,
  type AgentAuthenticatedRequest,
  type AgentContext,
} from "../types/agent.types.js";

function header(req: AgentAuthenticatedRequest, name: string): string | undefined {
  const value = req.header(name);
  return value?.trim() || undefined;
}

function peerSerial(req: AgentAuthenticatedRequest): string | undefined {
  const socket = req.socket as typeof req.socket & {
    getPeerCertificate?: () => { serialNumber?: string };
    authorized?: boolean;
  };
  const certificate = socket.getPeerCertificate?.();
  return certificate?.serialNumber?.replaceAll(":", "").toUpperCase();
}

export async function authenticateAgent(
  req: AgentAuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mtlsEnabled = process.env.AGENT_MTLS_ENABLED === "true";
    let agent: any = null;

    if (!mtlsEnabled) {
      const bearer = extractBearerToken(header(req, "authorization"));
      const bearerId = bearer?.startsWith("agent_dev_")
        ? bearer.slice("agent_dev_".length)
        : undefined;
      const agentId = bearerId ?? header(req, "x-agent-id");
      if (!agentId) throw new UnauthorizedError("Agent credentials required");
      const suppliedSerial = header(req, "x-client-cert-serial");
      if (!bearerId && !suppliedSerial) {
        throw new UnauthorizedError("Agent ID and certificate serial required");
      }

      agent = await agentDb.agent.findFirst({
        where: { id: agentId, revokedAt: null },
      });
      if (suppliedSerial) {
        const certificate = await agentDb.agentCertificate.findFirst({
          where: {
            agentId,
            serialNumber: suppliedSerial.replaceAll(":", "").toUpperCase(),
            revokedAt: null,
          },
        });
        if (!certificate) throw new UnauthorizedError("Agent certificate serial mismatch");
      }
    } else {
      const serial =
        peerSerial(req) ??
        header(req, "x-client-cert-serial")?.replaceAll(":", "").toUpperCase();
      if (!serial) throw new UnauthorizedError("Client certificate required");
      const certificate = await agentDb.agentCertificate.findFirst({
        where: { serialNumber: serial, revokedAt: null },
        include: { agent: true },
      });
      agent = certificate?.agent ?? null;
    }

    if (!agent || agent.state === "REVOKED" || agent.revokedAt) {
      throw new UnauthorizedError("Unknown or revoked agent");
    }

    const scope =
      agent.scopeProfileJson && typeof agent.scopeProfileJson === "object"
        ? agent.scopeProfileJson
        : {};
    req.agentContext = {
      agentId: agent.id,
      organizationId: agent.organizationId,
      zoneName: scope.zoneName ?? "default",
      correlationId:
        req.correlationId ?? getCorrelationId() ?? `${agent.id}-${Date.now()}`,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function getAgentContext(req: AgentAuthenticatedRequest): AgentContext {
  if (!req.agentContext) throw new UnauthorizedError("Agent authentication required");
  return req.agentContext;
}
