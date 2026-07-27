import type { Prisma, User as PrismaUser, UserStatus } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type UserRecord = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type UserWithRoles = UserRecord & {
  roleIds: string[];
  roleNames: string[];
};

export type CreateUserData = {
  organizationId: string;
  email: string;
  name: string;
  status?: UserStatus;
  createdBy?: string;
  updatedBy?: string;
};

export type UpdateUserData = {
  name?: string;
  status?: UserStatus;
  updatedBy?: string;
};

function mapUser(row: PrismaUser): UserRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name,
    status: row.status,
    lastLoginAt: row.lastLoginAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class UserRepository extends BaseRepository {
  async findById(
    query: TenantScopedQuery & { id: string },
  ): Promise<UserWithRoles | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.user.findFirst({
      where: {
        id: query.id,
        ...where,
      },
      include: {
        userRoles: {
          include: { role: { select: { id: true, name: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      ...mapUser(row),
      roleIds: row.userRoles.map((ur) => ur.role.id),
      roleNames: row.userRoles.map((ur) => ur.role.name),
    };
  }

  async findByEmail(
    query: TenantScopedQuery & { email: string },
  ): Promise<UserRecord | null> {
    const where = this.tenantWhere(query);
    const row = await prisma.user.findFirst({
      where: {
        email: query.email.toLowerCase(),
        ...where,
      },
    });
    return row ? mapUser(row) : null;
  }

  async list(
    query: TenantScopedQuery & { skip: number; take: number },
  ): Promise<{ items: UserWithRoles[]; total: number }> {
    const where = this.tenantWhere(query);
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: query.skip,
        take: query.take,
        include: {
          userRoles: {
            include: { role: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...mapUser(row),
        roleIds: row.userRoles.map((ur) => ur.role.id),
        roleNames: row.userRoles.map((ur) => ur.role.name),
      })),
      total,
    };
  }

  async create(db: DbClient, data: CreateUserData): Promise<UserRecord> {
    const row = await db.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email.toLowerCase(),
        name: data.name,
        status: data.status ?? "INVITED",
        createdBy: data.createdBy,
        updatedBy: data.updatedBy ?? data.createdBy,
      },
    });
    return mapUser(row);
  }

  async update(
    db: DbClient,
    query: TenantScopedQuery & { id: string },
    data: UpdateUserData,
  ): Promise<UserRecord> {
    this.requireOrganizationId(query);
    const row = await db.user.update({
      where: { id: query.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.updatedBy !== undefined ? { updatedBy: data.updatedBy } : {}),
      },
    });
    return mapUser(row);
  }

  async assignRoles(
    db: DbClient,
    data: {
      organizationId: string;
      userId: string;
      roleIds: string[];
      assignedBy?: string;
    },
  ): Promise<void> {
    for (const roleId of data.roleIds) {
      await db.userRole.create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          roleId,
          assignedBy: data.assignedBy,
        },
      });
    }
  }

  async findRolesByIds(
    query: TenantScopedQuery & { roleIds: string[] },
  ): Promise<Array<{ id: string; name: string }>> {
    const where = this.tenantWhere(query);
    if (query.roleIds.length === 0) return [];
    return prisma.role.findMany({
      where: {
        id: { in: query.roleIds },
        ...where,
      },
      select: { id: true, name: true },
    });
  }

  async findRoleByName(
    query: TenantScopedQuery & { name: string },
  ): Promise<{ id: string; name: string } | null> {
    const where = this.tenantWhere(query);
    return prisma.role.findFirst({
      where: {
        name: query.name,
        ...where,
      },
      select: { id: true, name: true },
    });
  }
}
