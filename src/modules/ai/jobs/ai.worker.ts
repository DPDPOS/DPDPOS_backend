import { Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { OpenAICompatibleAdapter } from "../../../infrastructure/ai-provider/openai-compatible.adapter.js";
import { buildExplainPrompt, buildSummarizePrompt, buildDraftPrompt } from "../domain/prompt-builders.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { sanitizeAiContext } from "../domain/context-builders/sanitize-ai-context.js";

let worker: Worker | null = null;

export function startAiWorker(): void {
  if (worker) return;
  worker = new Worker(QUEUE_NAMES.AI, async (job) => {
    const { requestId, context } = job.data;
    
    const log = await prisma.aiUsageLog.findUnique({ where: { id: requestId } });
    if (!log) throw new Error(`AiUsageLog not found: ${requestId}`);
    
    await prisma.aiUsageLog.update({ where: { id: requestId }, data: { status: 'PROCESSING' } });
    
    try {
      let entityData = null;
      if (log.useCase === 'EXPLAIN' || log.useCase === 'SUMMARIZE') {
        if (log.entityType === 'validation_result') {
          entityData = await prisma.validationResult.findFirst({
            where: { id: log.entityId!, organizationId: log.organizationId, deletedAt: null },
          });
        } else if (log.entityType === 'violation') {
          entityData = await prisma.violation.findFirst({
            where: { id: log.entityId!, organizationId: log.organizationId, deletedAt: null },
          });
        } else if (log.entityType === 'evidence') {
          entityData = await prisma.evidenceFile.findFirst({
            where: { id: log.entityId!, organizationId: log.organizationId, deletedAt: null },
          });
        } else if (log.entityType === 'validation_run') {
          entityData = await prisma.validationRun.findFirst({
            where: { id: log.entityId!, organizationId: log.organizationId, deletedAt: null },
          });
        }
        if (!entityData) throw new Error("Requested AI entity was not found in this organization");
      }

      let promptData = { system: '', prompt: '' };
      if (log.useCase === 'EXPLAIN') {
        promptData = buildExplainPrompt(log.entityType!, sanitizeAiContext(entityData));
      } else if (log.useCase === 'SUMMARIZE') {
        promptData = buildSummarizePrompt(log.entityType!, sanitizeAiContext(entityData));
      } else if (log.useCase === 'DRAFT') {
        promptData = buildDraftPrompt(log.entityType!, sanitizeAiContext(context));
      }
      
      const startTime = Date.now();

      await prisma.aiUsageLog.update({
        where: { id: requestId },
        data: { promptText: promptData.prompt },
      });
      
      const llm = new OpenAICompatibleAdapter();
      const result = await llm.complete({
        prompt: promptData.prompt,
        system: promptData.system,
      });
      
      const latencyMs = Date.now() - startTime;
      
      await prisma.$transaction(async (tx) => {
        await tx.aiUsageLog.update({
          where: { id: requestId },
          data: {
            status: 'COMPLETED',
            resultText: result.text,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs,
          }
        });
        
        const eventType = log.useCase === 'DRAFT' ? "AiDraftReady" : "AiSummaryReady";
        await writeOutboxEvent(tx, {
          eventType: eventType as any,
          organizationId: log.organizationId,
          payload: { requestId },
          actorUserId: log.requestedBy || "00000000-0000-0000-0000-000000000000",
        });
      });
      
    } catch (error: any) {
      await prisma.aiUsageLog.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          errorMessage: error.message || 'Unknown error'
        }
      });
      throw error;
    }
  }, {
    connection: createBullMqConnectionOptions(),
    concurrency: 5,
  });
  
  worker.on("completed", (job) => { logger.debug({ jobId: job.id }, "ai.job_completed"); });
  worker.on("failed", (job, err) => { logger.error({ jobId: job?.id, err }, "ai.job_failed"); });
  logger.info("ai.worker_started");
}

export function stopAiWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker; worker = null; return w.close();
}
