import type { Framework, Control, Requirement, Prisma } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type FrameworkWithChildren = Framework & {
  controls: Control[];
  requirements: Requirement[];
};

export class FrameworkRepository extends BaseRepository {
  async findById(
    query: TenantScopedQuery & { id: string },
  ): Promise<FrameworkWithChildren | null> {
    const where = this.tenantWhere(query);
    return prisma.framework.findFirst({
      where: {
        id: query.id,
        ...where,
      },
      include: {
        controls: { where: { deletedAt: null }, orderBy: { code: "asc" } },
        requirements: { where: { deletedAt: null }, orderBy: { code: "asc" } },
      },
    });
  }

  async findLatestForOrg(
    query: TenantScopedQuery,
  ): Promise<FrameworkWithChildren | null> {
    const where = this.tenantWhere(query);
    const include = {
      controls: { where: { deletedAt: null }, orderBy: { code: "asc" as const } },
      requirements: {
        where: { deletedAt: null },
        orderBy: { code: "asc" as const },
      },
    };

    const published = await prisma.framework.findFirst({
      where: { ...where, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      include,
    });
    if (published) return published;

    return prisma.framework.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      include,
    });
  }

  async deleteDraftsWithChildren(
    db: DbClient,
    organizationId: string,
  ): Promise<void> {
    const drafts = await db.framework.findMany({
      where: {
        organizationId,
        status: "DRAFT",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (drafts.length === 0) return;

    const ids = drafts.map((d) => d.id);

    // Hard-delete drafts so @@unique([organizationId, code]) can be reused.
    await db.requirement.deleteMany({
      where: { organizationId, frameworkId: { in: ids } },
    });
    await db.control.deleteMany({
      where: { organizationId, frameworkId: { in: ids } },
    });
    await db.framework.deleteMany({
      where: { id: { in: ids }, organizationId },
    });
  }

  async createFramework(
    db: DbClient,
    data: {
      organizationId: string;
      name: string;
      industryProfile: string;
      maturityLevel: string;
      isSdf: boolean;
      roadmapJson: Prisma.InputJsonValue;
      createdBy: string;
      updatedBy: string;
    },
  ): Promise<Framework> {
    return db.framework.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        status: "DRAFT",
        industryProfile: data.industryProfile,
        maturityLevel: data.maturityLevel,
        isSdf: data.isSdf,
        roadmapJson: data.roadmapJson,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      },
    });
  }

  async createControl(
    db: DbClient,
    data: {
      organizationId: string;
      frameworkId: string;
      code: string;
      title: string;
      description: string;
      legalBasisRef: string;
      phase?: string;
      sdfOverlay?: boolean;
      dueAt: Date;
      createdBy: string;
      updatedBy: string;
    },
  ): Promise<Control> {
    return db.control.create({
      data: {
        organizationId: data.organizationId,
        frameworkId: data.frameworkId,
        code: data.code,
        title: data.title,
        description: data.description,
        legalBasisRef: data.legalBasisRef,
        phase: data.phase,
        sdfOverlay: data.sdfOverlay ?? false,
        dueAt: data.dueAt,
        status: "NOT_STARTED",
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      },
    });
  }

  async createRequirement(
    db: DbClient,
    data: {
      organizationId: string;
      frameworkId: string;
      controlId: string;
      code: string;
      title: string;
      description: string;
      legalBasisRef: string;
      createdBy: string;
      updatedBy: string;
    },
  ): Promise<Requirement> {
    return db.requirement.create({
      data: {
        organizationId: data.organizationId,
        frameworkId: data.frameworkId,
        controlId: data.controlId,
        code: data.code,
        title: data.title,
        description: data.description,
        legalBasisRef: data.legalBasisRef,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      },
    });
  }

  async publish(
    db: DbClient,
    data: {
      organizationId: string;
      frameworkId: string;
      updatedBy: string;
      publishedAt: Date;
    },
  ): Promise<Framework> {
    // Archive other published frameworks in the org
    await db.framework.updateMany({
      where: {
        organizationId: data.organizationId,
        status: "PUBLISHED",
        deletedAt: null,
        id: { not: data.frameworkId },
      },
      data: {
        status: "ARCHIVED",
        updatedBy: data.updatedBy,
      },
    });

    return db.framework.update({
      where: { id: data.frameworkId },
      data: {
        status: "PUBLISHED",
        publishedAt: data.publishedAt,
        updatedBy: data.updatedBy,
      },
    });
  }

  async updateRoadmapJson(
    db: DbClient,
    data: {
      frameworkId: string;
      roadmapJson: Prisma.InputJsonValue;
      updatedBy: string;
    },
  ): Promise<void> {
    await db.framework.update({
      where: { id: data.frameworkId },
      data: {
        roadmapJson: data.roadmapJson,
        updatedBy: data.updatedBy,
      },
    });
  }
}
