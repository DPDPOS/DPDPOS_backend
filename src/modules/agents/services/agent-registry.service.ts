import { NotFoundError } from "../../../shared/errors/app-error.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { agentDb } from "../types/agent.types.js";

export class AgentRegistryService {
  listAgents(ctx: RequestContext) {
    return agentDb.agent.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: { certificates: { where: { revokedAt: null }, take: 1 } },
    });
  }

  async getAgent(ctx: RequestContext, id: string) {
    const agent = await agentDb.agent.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { certificates: true, tasks: { take: 25, orderBy: { createdAt: "desc" } } },
    });
    if (!agent) throw new NotFoundError("Agent not found");
    return agent;
  }

  async revokeAgent(ctx: RequestContext, id: string) {
    const agent = await agentDb.agent.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!agent) throw new NotFoundError("Agent not found");
    const revokedAt = new Date();
    await agentDb.$transaction([
      agentDb.agent.update({
        where: { id },
        data: { state: "REVOKED", revokedAt },
      }),
      agentDb.agentCertificate.updateMany({
        where: { agentId: id, revokedAt: null },
        data: { revokedAt },
      }),
      agentDb.agentTask.updateMany({
        where: { agentId: id, status: { in: ["PENDING", "DISPATCHED"] } },
        data: { status: "CANCELLED" },
      }),
    ]);
    return { id, status: "REVOKED", revokedAt };
  }
}

export const agentRegistryService = new AgentRegistryService();
