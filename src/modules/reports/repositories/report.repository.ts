import type { Prisma, Report as PrismaReport } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { ReportRecord } from "../dto/report-response.dto.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapRow(row: PrismaReport): ReportRecord {
  return {
    ...row,
    parameters: row.parameters as any,
  };
}

export class ReportRepository extends BaseRepository {
  async findById(organizationId: string, id: string): Promise<ReportRecord | null> {
    const row = await prisma.report.findFirst({
      where: { id, ...this.tenantWhere({ organizationId }) },
    });
    return row ? mapRow(row) : null;
  }

  async create(db: DbClient, ctx: RequestContext, data: any): Promise<ReportRecord> {
    const row = await db.report.create({
      data: {
        organizationId: ctx.organizationId,
        ...data,
        ...this.auditCreateFields(ctx),
      },
    });
    return mapRow(row);
  }

  async list(organizationId: string, filters: any, page: number, pageSize: number): Promise<ReportRecord[]> {
    const rows = await prisma.report.findMany({
      where: {
        ...this.tenantWhere({ organizationId }),
        ...(filters.reportType ? { reportType: filters.reportType } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRow);
  }

  async countByOrg(organizationId: string, filters: any): Promise<number> {
    return await prisma.report.count({
      where: {
        ...this.tenantWhere({ organizationId }),
        ...(filters.reportType ? { reportType: filters.reportType } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
    });
  }

  async updateStatus(
    db: DbClient,
    id: string,
    data: { status: any; storageKey?: string; startedAt?: Date; completedAt?: Date; errorMessage?: string }
  ): Promise<ReportRecord> {
    const row = await db.report.update({
      where: { id },
      data,
    });
    return mapRow(row);
  }

  async cancel(organizationId: string, id: string): Promise<boolean> {
    const result = await prisma.report.updateMany({
      where: {
        id,
        ...this.tenantWhere({ organizationId }),
        status: { in: ["PENDING", "GENERATING"] },
      },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }
}
