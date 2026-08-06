import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import { AiUsageRepository } from "../repositories/ai-usage.repository.js";
import { aiQueue } from "../../../jobs/queues/ai.queue.js";
import type { AiExplainDto, AiSummarizeDto, AiDraftDto } from "../dto/ai.dto.js";

export class AiService {
  private repo = new AiUsageRepository();

  async explain(ctx: RequestContext, dto: AiExplainDto) {
    return withTransaction(async (tx) => {
      const log = await this.repo.create(tx, ctx, {
        useCase: 'EXPLAIN',
        module: 'ai',
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: 'PENDING',
        requestedBy: ctx.actorUserId
      });
      await aiQueue.add('ai-request', { requestId: log.id });
      return { requestId: log.id, status: 'PENDING' };
    });
  }

  async summarize(ctx: RequestContext, dto: AiSummarizeDto) {
    return withTransaction(async (tx) => {
      const log = await this.repo.create(tx, ctx, {
        useCase: 'SUMMARIZE',
        module: 'ai',
        entityType: dto.entityType,
        entityId: dto.entityId,
        status: 'PENDING',
        requestedBy: ctx.actorUserId
      });
      await aiQueue.add('ai-request', { requestId: log.id });
      return { requestId: log.id, status: 'PENDING' };
    });
  }

  async draft(ctx: RequestContext, dto: AiDraftDto) {
    return withTransaction(async (tx) => {
      const log = await this.repo.create(tx, ctx, {
        useCase: 'DRAFT',
        module: 'ai',
        entityType: dto.draftType,
        status: 'PENDING',
        requestedBy: ctx.actorUserId
      });
      await aiQueue.add('ai-request', { requestId: log.id, context: dto.context });
      return { requestId: log.id, status: 'PENDING' };
    });
  }

  async getResult(ctx: RequestContext, id: string) {
    const log = await this.repo.findById(ctx.organizationId, id);
    if (!log) throw new NotFoundError("AI Request not found");
    return log;
  }

  async getUsageStats(ctx: RequestContext) {
    return this.repo.getUsageStats(ctx.organizationId);
  }
}

export const aiService = new AiService();
