import { randomUUID, verify } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { agentTasksQueue } from "../../../jobs/queues/agent-tasks.queue.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import type { TaskResultDto } from "../dto/agent.dto.js";
import {
  agentDb,
  type AgentContext,
  type AgentPrismaClient,
} from "../types/agent.types.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { violationService } from "../../violations/services/violation.service.js";

export type AgentTaskPayload = {
  type: string;
  agentId?: string;
  zoneName?: string;
  data?: unknown;
  maxRetries?: number;
};

export class TaskDispatchService {
  async enqueueAgentTask(organizationId: string, payload: AgentTaskPayload) {
    const agent =
      (payload.agentId &&
        (await agentDb.agent.findFirst({
          where: { id: payload.agentId, organizationId, revokedAt: null },
        }))) ||
      (await agentDb.agent.findFirst({
        where: {
          organizationId,
          revokedAt: null,
          ...(payload.zoneName ? { zoneName: payload.zoneName } : {}),
        },
        orderBy: { lastHeartbeatAt: "desc" },
      }));
    if (!agent) throw new NotFoundError("No eligible agent is enrolled");

    const task = await agentDb.agentTask.create({
      data: {
        organizationId,
        agentId: agent.id,
        type: payload.type,
        dedupeKey: randomUUID(),
        payloadJson: payload.data ?? {},
        status: "PENDING",
      },
    });
    await agentTasksQueue.add("dispatch", { taskId: task.id, organizationId });
    return task;
  }

  async submitTaskResult(
    ctx: AgentContext,
    taskId: string,
    input: TaskResultDto,
  ) {
    const task = await agentDb.agentTask.findFirst({
      where: {
        id: taskId,
        agentId: ctx.agentId,
        organizationId: ctx.organizationId,
      },
    });
    if (!task) throw new NotFoundError("Agent task not found");

    const cert = await agentDb.agentCertificate.findFirst({
      where: { agentId: ctx.agentId, revokedAt: null },
      orderBy: { issuedAt: "desc" },
    });
    let signatureVerified = false;
    if (input.signature && cert?.certificatePem) {
      try {
        signatureVerified = verify(
          "sha256",
          Buffer.from(JSON.stringify(input.result)),
          cert.certificatePem,
          Buffer.from(input.signature, "base64"),
        );
      } catch {
        signatureVerified = false;
      }
    }
    const proof = {
      signature: input.signature,
      signatureVerified,
      submittedAt: new Date().toISOString(),
      ...input.proof,
    };

    const outcome = await withTransaction(async (tx) => {
      const db = tx as unknown as AgentPrismaClient;
      if (input.status === "COMPLETED") {
        const updated = await db.agentTask.update({
          where: { id: task.id },
          data: {
            status: "SUCCEEDED",
            resultJson: { result: input.result, proof } as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        await (tx as any).erasureChecklistItem.updateMany({
          where: { agentTaskId: task.id },
          data: {
            status: "DONE",
            confirmedAt: new Date(),
            executionProof: proof,
            rowsAffected:
              typeof input.result === "object" &&
              input.result !== null &&
              "rowsAffected" in input.result
                ? Number((input.result as { rowsAffected?: unknown }).rowsAffected) || 0
                : null,
          },
        });
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.DsrTaskCompleted,
          organizationId: ctx.organizationId,
          correlationId: ctx.correlationId,
          payload: { taskId: task.id, requestId: task.dataSubjectRequestId },
        });
        return { updated, findingId: null as string | null };
      }

      const attemptCount = (task.attemptCount ?? 0) + 1;
      const maxRetries = Number(process.env.AGENT_TASK_MAX_RETRIES ?? 3);
      const escalated = attemptCount >= maxRetries;
      const updated = await db.agentTask.update({
        where: { id: task.id },
        data: {
          status: escalated ? "ESCALATED" : "PENDING",
          attemptCount,
          resultJson: { result: input.result, proof } as Prisma.InputJsonValue,
          failureReason:
            typeof input.result === "object"
              ? JSON.stringify(input.result).slice(0, 2_000)
              : String(input.result).slice(0, 2_000),
          ...(!escalated
            ? { availableAt: new Date(Date.now() + 2 ** attemptCount * 1_000) }
            : {}),
          ...(escalated ? { completedAt: new Date() } : {}),
        },
      });
      if (escalated && db.complianceFinding) {
        const finding = await db.complianceFinding.upsert({
          where: {
            organizationId_dedupeKey: {
              organizationId: ctx.organizationId,
              dedupeKey: `agent-task:${task.id}`,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            agentId: ctx.agentId,
            source: "AGENT",
            sourceKey: task.id,
            dedupeKey: `agent-task:${task.id}`,
            ruleCode: "VLD-DSR-ESCALATED",
            severity: "HIGH",
            status: "OPEN",
            title: "Agent task retries exhausted",
            description: `Agent task ${task.id} exceeded its retry allowance`,
          },
          update: {
            status: "OPEN",
            description: `Agent task ${task.id} exceeded its retry allowance`,
            lastSeenAt: new Date(),
          },
        });
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.ComplianceFindingUpserted,
          organizationId: ctx.organizationId,
          correlationId: ctx.correlationId,
          payload: {
            findingId: finding.id,
            dedupeKey: finding.dedupeKey,
            ruleCode: finding.ruleCode,
            severity: finding.severity,
            status: finding.status,
          },
        });
        await (tx as any).erasureChecklistItem.updateMany({
          where: { agentTaskId: task.id },
          data: {
            status: "FAILED",
            failureReason: `Agent task retries exhausted after ${attemptCount} attempts`,
            executionProof: proof,
          },
        });
        return { updated, findingId: finding.id as string };
      }
      return { updated, findingId: null as string | null };
    });

    if (outcome.findingId) {
      const violation = await violationService.openOrDedupe(
        {
          correlationId: ctx.correlationId,
          organizationId: ctx.organizationId,
          actorUserId: task.requestedBy ?? ctx.agentId,
          permissions: [],
          roles: [],
        },
        {
          findingSource: "AGENT",
          ruleOrControlCode: "VLD-DSR-ESCALATED",
          entityType: "AgentTask",
          entityId: task.id,
          severity: "HIGH",
          title: "DSR agent task escalated",
          description: `Agent task ${task.id} exhausted retries and requires manual intervention`,
          complianceFindingId: outcome.findingId,
          agentId: ctx.agentId,
          correlationId: ctx.correlationId,
          evidenceRequiredFlag: true,
        },
      );
      await withTransaction((tx) =>
        writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.DsrTaskEscalated,
          organizationId: ctx.organizationId,
          correlationId: ctx.correlationId,
          payload: {
            taskId: task.id,
            requestId: task.dataSubjectRequestId,
            findingId: outcome.findingId,
            violationId: violation.violation.id,
          },
        }),
      );
    }
    return outcome.updated;
  }
}

export const taskDispatchService = new TaskDispatchService();
