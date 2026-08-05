import type { Prisma, AiUsageLog as PrismaAiUsageLog } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { AiUsageLogRecord } from "../dto/ai-response.dto.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapRow(row: PrismaAiUsageLog): AiUsageLogRecord {
  return row as AiUsageLogRecord;
}

export class AiUsageRepository extends BaseRepository {
  async create(db: DbClient, ctx: RequestContext, data: any) {
    const row = await db.aiUsageLog.create({
      data: {
        organizationId: ctx.organizationId,
        ...data,
        ...this.auditCreateFields(ctx),
      },
    });
    return mapRow(row);
  }

  async findById(organizationId: string, id: string) {
    const row = await prisma.aiUsageLog.findFirst({
      where: { id, ...this.tenantWhere({ organizationId }) },
    });
    return row ? mapRow(row) : null;
  }

  async updateResult(db: DbClient, id: string, data: any) {
    const row = await db.aiUsageLog.update({
      where: { id },
      data,
    });
    return mapRow(row);
  }

  async getUsageStats(organizationId: string) {
    const [counts, stats] = await Promise.all([
      prisma.aiUsageLog.groupBy({
        by: ['useCase', 'status'],
        where: this.tenantWhere({ organizationId }),
        _count: true,
      }),
      prisma.aiUsageLog.aggregate({
        where: this.tenantWhere({ organizationId }),
        _sum: {
          tokensIn: true,
          tokensOut: true,
        }
      })
    ]);
    return { counts, stats };
  }
}
