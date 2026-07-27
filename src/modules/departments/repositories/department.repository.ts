import type { Prisma, Department as PrismaDepartment } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type DepartmentRecord = {
  id: string;
  organizationId: string;
  name: string;
  headUserId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateDepartmentData = {
  organizationId: string;
  name: string;
  headUserId?: string | null;
  createdBy?: string;
  updatedBy?: string;
};

function mapDepartment(row: PrismaDepartment): DepartmentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    headUserId: row.headUserId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class DepartmentRepository extends BaseRepository {
  async findById(
    query: TenantScopedQuery & { id: string },
  ): Promise<DepartmentRecord | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.department.findFirst({
      where: {
        id: query.id,
        ...where,
      },
    });
    return row ? mapDepartment(row) : null;
  }

  async findByName(
    query: TenantScopedQuery & { name: string },
  ): Promise<DepartmentRecord | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.department.findFirst({
      where: {
        name: query.name,
        ...where,
      },
    });
    return row ? mapDepartment(row) : null;
  }

  async list(
    query: TenantScopedQuery & { skip: number; take: number },
  ): Promise<{ items: DepartmentRecord[]; total: number }> {
    const where = this.tenantWhere(query);
    const [rows, total] = await Promise.all([
      prisma.department.findMany({
        where,
        orderBy: { name: "asc" },
        skip: query.skip,
        take: query.take,
      }),
      prisma.department.count({ where }),
    ]);
    return { items: rows.map(mapDepartment), total };
  }

  async create(db: DbClient, data: CreateDepartmentData): Promise<DepartmentRecord> {
    const row = await db.department.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        headUserId: data.headUserId ?? null,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy ?? data.createdBy,
      },
    });
    return mapDepartment(row);
  }

  async findActiveUserInOrg(
    query: TenantScopedQuery & { userId: string },
  ): Promise<{ id: string } | null> {
    const where = this.tenantWhere(query);
    return prisma.user.findFirst({
      where: {
        id: query.userId,
        ...where,
        status: { not: "DISABLED" },
      },
      select: { id: true },
    });
  }
}
