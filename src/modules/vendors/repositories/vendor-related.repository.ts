import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class VendorAgreementRepository {
  async listByVendor(organizationId: string, vendorId: string) {
    return prisma.vendorAgreement.findMany({
      where: { organizationId, vendorId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async findActive(organizationId: string, vendorId: string) {
    return prisma.vendorAgreement.findFirst({
      where: {
        organizationId,
        vendorId,
        status: "ACTIVE",
        deletedAt: null,
      },
      orderBy: { expiresAt: "desc" },
    });
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    vendorId: string,
    data: {
      title: string;
      versionLabel: string;
      status?: "DRAFT" | "ACTIVE" | "EXPIRED" | "SUPERSEDED";
      effectiveFrom?: Date;
      expiresAt?: Date;
      storageKey?: string;
      evidenceFileId?: string;
      allowsSubProcessors?: boolean;
      crossBorderAllowed?: boolean;
      breachNotifyHours?: number;
      notes?: string;
    },
  ) {
    return db.vendorAgreement.create({
      data: {
        organizationId: ctx.organizationId,
        vendorId,
        title: data.title,
        versionLabel: data.versionLabel,
        status: data.status ?? "DRAFT",
        effectiveFrom: data.effectiveFrom,
        expiresAt: data.expiresAt,
        storageKey: data.storageKey,
        evidenceFileId: data.evidenceFileId,
        allowsSubProcessors: data.allowsSubProcessors ?? false,
        crossBorderAllowed: data.crossBorderAllowed ?? false,
        breachNotifyHours: data.breachNotifyHours,
        notes: data.notes,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
  }

  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    data: Record<string, unknown>,
  ) {
    return db.vendorAgreement.update({
      where: { id },
      data: { ...data, updatedBy: ctx.actorUserId },
    });
  }
}

export class VendorReviewRepository {
  async listByVendor(organizationId: string, vendorId: string) {
    return prisma.vendorDiligenceReview.findMany({
      where: { organizationId, vendorId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async findLatest(organizationId: string, vendorId: string) {
    return prisma.vendorDiligenceReview.findFirst({
      where: { organizationId, vendorId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    vendorId: string,
    data: {
      outcome?: "APPROVED" | "CONDITIONAL" | "REJECTED" | "PENDING";
      residualRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      dueAt?: Date;
      completedAt?: Date;
      questionnaireJson?: Prisma.InputJsonValue;
      notes?: string;
      evidenceFileIds?: string[];
    },
  ) {
    return db.vendorDiligenceReview.create({
      data: {
        organizationId: ctx.organizationId,
        vendorId,
        reviewerUserId: ctx.actorUserId,
        outcome: data.outcome ?? "PENDING",
        residualRisk: data.residualRisk,
        dueAt: data.dueAt,
        completedAt: data.completedAt,
        questionnaireJson: data.questionnaireJson,
        notes: data.notes,
        evidenceFileIds: data.evidenceFileIds ?? [],
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
  }
}

export class VendorRelationshipRepository {
  async listByParent(organizationId: string, parentVendorId: string) {
    return prisma.vendorRelationship.findMany({
      where: {
        organizationId,
        parentVendorId,
        deletedAt: null,
      },
      include: { childVendor: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async listByChild(organizationId: string, childVendorId: string) {
    return prisma.vendorRelationship.findMany({
      where: {
        organizationId,
        childVendorId,
        deletedAt: null,
      },
      include: { parentVendor: true },
    });
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: {
      parentVendorId: string;
      childVendorId: string;
      relationshipType:
        | "SUB_PROCESSOR"
        | "AFFILIATE"
        | "RESELLER"
        | "OTHER";
      personalDataFlows?: boolean;
      notificationRequired?: boolean;
      notes?: string;
    },
  ) {
    return db.vendorRelationship.create({
      data: {
        organizationId: ctx.organizationId,
        parentVendorId: data.parentVendorId,
        childVendorId: data.childVendorId,
        relationshipType: data.relationshipType,
        personalDataFlows: data.personalDataFlows ?? true,
        notificationRequired: data.notificationRequired ?? true,
        notes: data.notes,
        createdBy: ctx.actorUserId,
      },
    });
  }

  async acknowledge(db: DbClient, id: string) {
    return db.vendorRelationship.update({
      where: { id },
      data: { acknowledgedAt: new Date() },
    });
  }

  async countCriticalChildren(
    organizationId: string,
    parentVendorId: string,
  ): Promise<number> {
    const rows = await prisma.vendorRelationship.findMany({
      where: {
        organizationId,
        parentVendorId,
        deletedAt: null,
        childVendor: {
          deletedAt: null,
          criticality: { in: ["HIGH", "CRITICAL"] },
        },
      },
      select: { id: true },
    });
    return rows.length;
  }
}
