import { prisma } from "../infrastructure/database/prisma-client.js";
import { agentTasksQueue } from "../jobs/queues/agent-tasks.queue.js";
import { NotFoundError, ValidationError } from "../shared/errors/app-error.js";
import type { RequestContext } from "../shared/types/request-context.js";
import { erasureEvidenceService } from "../modules/rights/services/erasure-evidence.service.js";
import { writeOutboxEvent } from "../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { identityGraphService } from "./identity-graph.service.js";

export class DsrSagaService {
  async startAgentErasure(ctx: RequestContext, requestId: string) {
    const request = await prisma.dataSubjectRequest.findFirst({
      where: { id: requestId, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (!request) throw new NotFoundError("Data subject request not found");
    if (request.requestType !== "ERASURE") {
      throw new ValidationError("Agent erasure only applies to ERASURE requests");
    }

    // Preserve the established manual workflow and only seed it once.
    if (!request.softDeletedAt) {
      await erasureEvidenceService.startErasure(ctx, requestId);
    }

    const settings = await prisma.organizationControlPlaneSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!settings?.dsrDispatchEnabled) return this.getSagaStatus(ctx, requestId);

    const identityGraph = await identityGraphService.resolvePrincipal(
      ctx.organizationId,
      request.requesterReference,
    );
    const systemIds = [
      ...new Set(identityGraph.matches.map((match) => match.system.id)),
    ];
    const systems = await prisma.dataSystem.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: systemIds },
        deletedAt: null,
        agent: { revokedAt: null },
      },
      include: { agent: true },
    });

    for (const system of systems) {
      const dedupeKey = `dsr-erasure:${requestId}:${system.id}`;
      const existingTask = await prisma.agentTask.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: ctx.organizationId,
            dedupeKey,
          },
        },
      });
      const task = await prisma.$transaction(async (tx) => {
        const agentTask = await tx.agentTask.upsert({
          where: {
            organizationId_dedupeKey: {
              organizationId: ctx.organizationId,
              dedupeKey,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            agentId: system.agentId,
            dataSubjectRequestId: requestId,
            type: "DSR_ERASURE",
            dedupeKey,
            payloadJson: {
              requestId,
              systemId: system.id,
              systemExternalId: system.externalId,
              requesterIdentityHash: identityGraph.principalHash,
            },
            requestedBy: ctx.actorUserId,
            correlationId: ctx.correlationId,
          },
          update: {},
        });
        await tx.erasureChecklistItem.upsert({
          where: {
            dataSubjectRequestId_systemKey: {
              dataSubjectRequestId: requestId,
              systemKey: `agent-system:${system.id}`,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            dataSubjectRequestId: requestId,
            systemKey: `agent-system:${system.id}`,
            systemLabel: system.name,
            status: "PENDING",
            dispatchMode: "AGENT",
            agentTaskId: agentTask.id,
          },
          update: {
            dispatchMode: "AGENT",
            agentTaskId: agentTask.id,
          },
        });
        if (!existingTask) {
          await writeOutboxEvent(tx, {
            eventType: DOMAIN_EVENTS.DsrTaskDispatched,
            organizationId: ctx.organizationId,
            actorUserId: ctx.actorUserId,
            correlationId: ctx.correlationId,
            payload: {
              taskId: agentTask.id,
              requestId,
              systemId: system.id,
              agentId: system.agentId,
            },
          });
        }
        return agentTask;
      });
      if (!existingTask && task.status === "PENDING") {
        await agentTasksQueue.add(
          "dispatch",
          { taskId: task.id, organizationId: ctx.organizationId },
          { jobId: task.id },
        );
      }
    }
    return this.getSagaStatus(ctx, requestId);
  }

  async getSagaStatus(ctx: RequestContext, requestId: string) {
    const request = await prisma.dataSubjectRequest.findFirst({
      where: { id: requestId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!request) throw new NotFoundError("Data subject request not found");
    const items = await prisma.erasureChecklistItem.findMany({
      where: {
        organizationId: ctx.organizationId,
        dataSubjectRequestId: requestId,
        dispatchMode: "AGENT",
      },
      include: { agentTask: true },
      orderBy: { createdAt: "asc" },
    });
    const statuses = items.map((item) => item.agentTask?.status);
    return {
      total: items.length,
      completed: statuses.filter((status) => status === "SUCCEEDED").length,
      inRetry: items.filter(
        (item) =>
          (item.agentTask?.attemptCount ?? 0) > 0 &&
          ["PENDING", "DISPATCHED", "ACKNOWLEDGED", "RUNNING"].includes(
            item.agentTask?.status ?? "",
          ),
      ).length,
      failed: statuses.filter((status) =>
        ["FAILED", "CANCELLED", "EXPIRED"].includes(status ?? ""),
      ).length,
      escalated: statuses.filter((status) => status === "ESCALATED").length,
      items: items.map((item) => ({
        checklistItemId: item.id,
        systemKey: item.systemKey,
        systemLabel: item.systemLabel,
        checklistStatus: item.status,
        taskId: item.agentTaskId,
        taskStatus: item.agentTask?.status ?? null,
        attemptCount: item.agentTask?.attemptCount ?? 0,
        failureReason: item.agentTask?.failureReason ?? item.failureReason,
        completedAt: item.agentTask?.completedAt ?? item.confirmedAt,
      })),
    };
  }
}

export const dsrSagaService = new DsrSagaService();
