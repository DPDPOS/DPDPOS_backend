import type { Prisma, Requirement } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type RequirementListFilters = TenantScopedQuery & {
  frameworkId?: string;
  controlId?: string;
  unmapped?: boolean;
  skip: number;
  take: number;
};

export type CreateRequirementData = {
  organizationId: string;
  frameworkId: string;
  controlId?: string | null;
  code: string;
  title: string;
  description?: string;
  legalBasisRef?: string;
  createdBy: string;
  updatedBy: string;
};

export class RequirementRepository extends BaseRepository {
  async findById(
    query: TenantScopedQuery & { id: string },
  ): Promise<Requirement | null> {
    const where = this.tenantWhere(query);
    return prisma.requirement.findFirst({
      where: {
        id: query.id,
        ...where,
      },
    });
  }

  async findByCode(
    query: TenantScopedQuery & { frameworkId: string; code: string },
  ): Promise<Requirement | null> {
    const where = this.tenantWhere(query);
    return prisma.requirement.findFirst({
      where: {
        ...where,
        frameworkId: query.frameworkId,
        code: query.code,
      },
    });
  }

  async list(
    query: RequirementListFilters,
  ): Promise<{ items: Requirement[]; total: number }> {
    const where = {
      ...this.tenantWhere(query),
      ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      ...(query.controlId ? { controlId: query.controlId } : {}),
      ...(query.unmapped ? { controlId: null } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.requirement.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip: query.skip,
        take: query.take,
      }),
      prisma.requirement.count({ where }),
    ]);

    return { items, total };
  }

  async create(db: DbClient, data: CreateRequirementData): Promise<Requirement> {
    return db.requirement.create({
      data: {
        organizationId: data.organizationId,
        frameworkId: data.frameworkId,
        controlId: data.controlId ?? null,
        code: data.code,
        title: data.title,
        description: data.description,
        legalBasisRef: data.legalBasisRef,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      },
    });
  }

  async mapToControl(
    db: DbClient,
    id: string,
    data: { controlId: string; updatedBy: string },
  ): Promise<Requirement> {
    return db.requirement.update({
      where: { id },
      data: {
        controlId: data.controlId,
        updatedBy: data.updatedBy,
      },
    });
  }

  async update(
    db: DbClient,
    id: string,
    data: {
      title?: string;
      description?: string | null;
      legalBasisRef?: string | null;
      status?: import("@prisma/client").RequirementStatus;
      updatedBy: string;
    },
  ): Promise<Requirement> {
    return db.requirement.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.legalBasisRef !== undefined
          ? { legalBasisRef: data.legalBasisRef }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedBy: data.updatedBy,
      },
    });
  }

  async softDelete(
    db: DbClient,
    id: string,
    updatedBy: string,
  ): Promise<Requirement> {
    return db.requirement.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy,
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
      select: { id: true },
    });
  }

  async findControlInOrg(
    query: TenantScopedQuery & { controlId: string; frameworkId?: string },
  ) {
    const where = this.tenantWhere(query);
    return prisma.control.findFirst({
      where: {
        id: query.controlId,
        ...where,
        ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
      },
      select: { id: true, frameworkId: true, code: true },
    });
  }
}
