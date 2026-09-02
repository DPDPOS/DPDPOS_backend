import type { Prisma, EvidenceFile } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { EvidenceFileRecord } from "../dto/evidence-response.dto.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapRow(row: EvidenceFile): EvidenceFileRecord {
  return {
    ...row,
    tags: row.tags ?? [],
  };
}

export class EvidenceRepository extends BaseRepository {
  async create(db: DbClient, ctx: RequestContext, data: any) {
    const row = await db.evidenceFile.create({
      data: {
        organizationId: ctx.organizationId,
        ...data,
        ...this.auditCreateFields(ctx),
      },
    });
    return mapRow(row);
  }

  async findById(organizationId: string, id: string) {
    const row = await prisma.evidenceFile.findFirst({
      where: { id, ...this.tenantWhere({ organizationId }) },
    });
    return row ? mapRow(row) : null;
  }

  async list(organizationId: string, filters: any) {
    const { status, controlId, violationId, page = 1, pageSize = 20 } = filters;
    const where: Prisma.EvidenceFileWhereInput = {
      ...this.tenantWhere({ organizationId }),
      ...(status && { status }),
      ...(controlId && { controlId }),
      ...(violationId && { violationId }),
    };

    const rows = await prisma.evidenceFile.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map(mapRow);
  }

  async countByOrg(organizationId: string, filters: any) {
    const { status, controlId, violationId } = filters;
    const where: Prisma.EvidenceFileWhereInput = {
      ...this.tenantWhere({ organizationId }),
      ...(status && { status }),
      ...(controlId && { controlId }),
      ...(violationId && { violationId }),
    };
    return prisma.evidenceFile.count({ where });
  }

  async update(db: DbClient, ctx: RequestContext, id: string, data: any) {
    const row = await db.evidenceFile.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        ...data,
        ...this.auditUpdateFields(ctx),
      },
    });
    const updated = await db.evidenceFile.findFirstOrThrow({
      where: { id, organizationId: ctx.organizationId }
    });
    return mapRow(updated);
  }

  async findByControl(organizationId: string, controlId: string) {
    const rows = await prisma.evidenceFile.findMany({
      where: { controlId, ...this.tenantWhere({ organizationId }) },
    });
    return rows.map(mapRow);
  }

  async findByViolation(organizationId: string, violationId: string) {
    const rows = await prisma.evidenceFile.findMany({
      where: { violationId, ...this.tenantWhere({ organizationId }) },
    });
    return rows.map(mapRow);
  }
}
