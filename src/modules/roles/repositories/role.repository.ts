import type { Prisma, Role as PrismaRole } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type RoleRecord = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystemRole: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateRoleData = {
  organizationId: string;
  name: string;
  description?: string;
  permissions: string[];
  createdBy?: string;
  updatedBy?: string;
};

function mapRole(row: PrismaRole): RoleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    permissions: row.permissions,
    isSystemRole: row.isSystemRole,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class RoleRepository extends BaseRepository {
  async findById(query: TenantScopedQuery & { id: string }): Promise<RoleRecord | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.role.findFirst({
      where: {
        id: query.id,
        ...where,
      },
    });
    return row ? mapRole(row) : null;
  }

  async findByName(
    query: TenantScopedQuery & { name: string },
  ): Promise<RoleRecord | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.role.findFirst({
      where: {
        name: query.name,
        ...where,
      },
    });
    return row ? mapRole(row) : null;
  }

  async list(
    query: TenantScopedQuery & { skip: number; take: number },
  ): Promise<{ items: RoleRecord[]; total: number }> {
    const where = this.tenantWhere(query);
    const [rows, total] = await Promise.all([
      prisma.role.findMany({
        where,
        orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
        skip: query.skip,
        take: query.take,
      }),
      prisma.role.count({ where }),
    ]);
    return { items: rows.map(mapRole), total };
  }

  async create(db: DbClient, data: CreateRoleData): Promise<RoleRecord> {
    const row = await db.role.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystemRole: false,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy ?? data.createdBy,
      },
    });
    return mapRole(row);
  }

  async updatePermissions(
    db: DbClient,
    query: TenantScopedQuery & { id: string },
    data: { permissions: string[]; updatedBy?: string },
  ): Promise<RoleRecord> {
    this.requireOrganizationId(query);
    const row = await db.role.update({
      where: { id: query.id },
      data: {
        permissions: data.permissions,
        updatedBy: data.updatedBy,
      },
    });
    return mapRole(row);
  }
}
