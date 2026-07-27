import type { Control, ControlStatus, Prisma } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type ControlListFilters = TenantScopedQuery & {
  frameworkId?: string;
  status?: ControlStatus;
  skip: number;
  take: number;
};

export type CreateControlData = {
  organizationId: string;
  frameworkId: string;
  code: string;
  title: string;
  description?: string;
  ownerUserId?: string;
  dueAt?: Date;
  legalBasisRef?: string;
  status?: ControlStatus;
  createdBy: string;
  updatedBy: string;
};

export type UpdateControlData = {
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  dueAt?: Date | null;
  legalBasisRef?: string | null;
  status?: ControlStatus;
  updatedBy: string;
};

export class ControlRepository extends BaseRepository {
  async findById(query: TenantScopedQuery & { id: string }): Promise<Control | null> {
    const where = this.tenantWhere(query);
    return prisma.control.findFirst({
      where: {
        id: query.id,
        ...where,
      },
    });
  }

  async findByCode(query: TenantScopedQuery & {
    frameworkId: string;
    code: string;
  }): Promise<Control | null> {
    const where = this.tenantWhere(query);
    return prisma.control.findFirst({
      where: {
        ...where,
        frameworkId: query.frameworkId,
        code: query.code,
      },
    });
  }

  async list(query: ControlListFilters): Promise<{ items: Control[]; total: number }> {
    const where = {
      ...this.tenantWhere(query),
      ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.control.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip: query.skip,
        take: query.take,
      }),
      prisma.control.count({ where }),
    ]);

    return { items, total };
  }

  async create(db: DbClient, data: CreateControlData): Promise<Control> {
    return db.control.create({
      data: {
        organizationId: data.organizationId,
        frameworkId: data.frameworkId,
        code: data.code,
        title: data.title,
        description: data.description,
        ownerUserId: data.ownerUserId,
        dueAt: data.dueAt,
        legalBasisRef: data.legalBasisRef,
        status: data.status ?? "NOT_STARTED",
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      },
    });
  }

  async update(
    db: DbClient,
    id: string,
    data: UpdateControlData,
  ): Promise<Control> {
    return db.control.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.ownerUserId !== undefined ? { ownerUserId: data.ownerUserId } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        ...(data.legalBasisRef !== undefined
          ? { legalBasisRef: data.legalBasisRef }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedBy: data.updatedBy,
      },
    });
  }

  async findFrameworkInOrg(query: TenantScopedQuery & { frameworkId: string }) {
    const where = this.tenantWhere(query);
    return prisma.framework.findFirst({
      where: {
        id: query.frameworkId,
        ...where,
      },
      select: { id: true, status: true },
    });
  }

  async findActiveUserInOrg(query: TenantScopedQuery & { userId: string }) {
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
