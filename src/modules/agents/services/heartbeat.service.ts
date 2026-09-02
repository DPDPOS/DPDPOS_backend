import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import type { HeartbeatDto } from "../dto/agent.dto.js";
import type { AgentContext, AgentPrismaClient } from "../types/agent.types.js";
import { popConsentInvalidations } from "../../../infrastructure/cache/consent-invalidation.js";

export class HeartbeatService {
  async record(ctx: AgentContext, input: HeartbeatDto) {
    const response = await withTransaction(async (tx) => {
      const db = tx as unknown as AgentPrismaClient;
      await db.agent.updateMany({
        where: {
          id: ctx.agentId,
          organizationId: ctx.organizationId,
          revokedAt: null,
        },
        data: {
          state: input.targetHealth === "HEALTHY" ? "ACTIVE" : "DEGRADED",
          metadataJson: {
            targetHealth: input.targetHealth,
            metrics: input.metrics ?? {},
          },
          ...(input.version ? { agentVersion: input.version } : {}),
          lastHeartbeatAt: new Date(),
        },
      });

      const pending = await db.agentTask.findFirst({
        where: {
          agentId: ctx.agentId,
          organizationId: ctx.organizationId,
          status: "PENDING",
          availableAt: { lte: new Date() },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!pending) return { ack: true as const };

      const claimed = await db.agentTask.updateMany({
        where: { id: pending.id, status: "PENDING" },
        data: { status: "DISPATCHED", dispatchedAt: new Date() },
      });
      if (claimed.count !== 1) return { ack: true as const };
      return {
        ack: true as const,
        task: {
          id: pending.id,
          type: pending.type,
          payload: pending.payloadJson,
          attempts: pending.attemptCount ?? 0,
        },
      };
    });
    const pendingInvalidations = await popConsentInvalidations(ctx.organizationId);
    return { ...response, pendingInvalidations };
  }
}

export const heartbeatService = new HeartbeatService();
