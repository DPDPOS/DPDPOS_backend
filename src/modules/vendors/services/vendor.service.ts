import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { VendorRepository } from "../repositories/vendor.repository.js";
import {
  VendorAgreementRepository,
  VendorRelationshipRepository,
  VendorReviewRepository,
} from "../repositories/vendor-related.repository.js";
import { computeVendorRisk } from "../domain/risk-calculator.js";
import {
  toVendorResponse,
  type VendorResponse,
  type VendorRiskScorecard,
} from "../types/vendor.types.js";
import type {
  CreateVendorDto,
  CreateVendorAgreementDto,
  CreateVendorRelationshipDto,
  CreateVendorReviewDto,
  UpdateVendorDto,
} from "../dto/vendor.dto.js";

export class VendorService {
  constructor(
    private readonly vendors = new VendorRepository(),
    private readonly agreements = new VendorAgreementRepository(),
    private readonly reviews = new VendorReviewRepository(),
    private readonly relationships = new VendorRelationshipRepository(),
  ) {}

  async create(
    ctx: RequestContext,
    input: CreateVendorDto,
  ): Promise<VendorResponse> {
    const vendor = await withTransaction(async (tx) => {
      const created = await this.vendors.create(tx, ctx, {
        ...input,
        nextReviewAt: input.nextReviewAt
          ? new Date(input.nextReviewAt)
          : undefined,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.VendorCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: { vendorId: created.id, name: created.name },
      });

      return created;
    });

    const scorecard = await this.buildScorecard(ctx.organizationId, vendor.id);
    const scored = await withTransaction(async (tx) =>
      this.vendors.update(tx, ctx, vendor.id, {
        version: vendor.version,
        inherentRiskScore: scorecard.inherentRiskScore,
        residualRiskScore: scorecard.residualRiskScore,
      }),
    );

    return toVendorResponse(scored ?? vendor);
  }

  async getById(ctx: RequestContext, id: string): Promise<VendorResponse> {
    const vendor = await this.vendors.findById(ctx.organizationId, id);
    if (!vendor) throw new NotFoundError("Vendor not found");
    return toVendorResponse(vendor);
  }

  async list(
    ctx: RequestContext,
    options: {
      status?: string;
      criticality?: string;
      vendorType?: string;
    } = {},
  ): Promise<VendorResponse[]> {
    const rows = await this.vendors.list(ctx.organizationId, options);
    return rows.map(toVendorResponse);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateVendorDto,
  ): Promise<VendorResponse> {
    const existing = await this.vendors.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Vendor not found");

    return withTransaction(async (tx) => {
      const updated = await this.vendors.update(tx, ctx, id, {
        ...input,
        nextReviewAt: input.nextReviewAt
          ? new Date(input.nextReviewAt)
          : undefined,
      });
      if (!updated) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      const scorecard = await this.buildScorecard(ctx.organizationId, id);
      await this.vendors.update(tx, ctx, id, {
        version: updated.version,
        inherentRiskScore: scorecard.inherentRiskScore,
        residualRiskScore: scorecard.residualRiskScore,
      });

      if (
        scorecard.residualRiskScore !== existing.residualRiskScore ||
        scorecard.openRiskFlags.length > 0
      ) {
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.VendorRiskChanged,
          organizationId: ctx.organizationId,
          actorUserId: ctx.actorUserId,
          correlationId: ctx.correlationId,
          payload: {
            vendorId: id,
            residualRiskScore: scorecard.residualRiskScore,
            flags: scorecard.openRiskFlags,
          },
        });
      }

      const refreshed = await this.vendors.findById(ctx.organizationId, id);
      return toVendorResponse(refreshed ?? updated);
    });
  }

  async offboard(ctx: RequestContext, id: string): Promise<VendorResponse> {
    const existing = await this.vendors.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Vendor not found");

    return withTransaction(async (tx) => {
      const vendor = await this.vendors.softDelete(tx, ctx, id);
      return toVendorResponse(vendor);
    });
  }

  async getRisk(
    ctx: RequestContext,
    id: string,
  ): Promise<VendorRiskScorecard> {
    const vendor = await this.vendors.findById(ctx.organizationId, id);
    if (!vendor) throw new NotFoundError("Vendor not found");
    return this.buildScorecard(ctx.organizationId, id);
  }

  async createAgreement(
    ctx: RequestContext,
    vendorId: string,
    input: CreateVendorAgreementDto,
  ) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");

    const agreement = await withTransaction(async (tx) => {
      const created = await this.agreements.create(tx, ctx, vendorId, {
        ...input,
        effectiveFrom: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : undefined,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });

      if (
        created.expiresAt &&
        created.expiresAt.getTime() < Date.now() + 60 * 24 * 60 * 60 * 1000
      ) {
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.DpaExpiring,
          organizationId: ctx.organizationId,
          actorUserId: ctx.actorUserId,
          correlationId: ctx.correlationId,
          payload: {
            vendorId,
            agreementId: created.id,
            expiresAt: created.expiresAt.toISOString(),
          },
        });
      }

      return created;
    });

    await this.refreshScores(ctx, vendorId);
    return agreement;
  }

  async listAgreements(ctx: RequestContext, vendorId: string) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");
    return this.agreements.listByVendor(ctx.organizationId, vendorId);
  }

  async createReview(
    ctx: RequestContext,
    vendorId: string,
    input: CreateVendorReviewDto,
  ) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");

    const review = await withTransaction(async (tx) =>
      this.reviews.create(tx, ctx, vendorId, {
        outcome: input.outcome,
        residualRisk: input.residualRisk,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        completedAt: input.complete ? new Date() : undefined,
        questionnaireJson: input.questionnaireJson as
          | import("@prisma/client").Prisma.InputJsonValue
          | undefined,
        notes: input.notes,
        evidenceFileIds: input.evidenceFileIds,
      }),
    );
    await this.refreshScores(ctx, vendorId);
    return review;
  }

  async listReviews(ctx: RequestContext, vendorId: string) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");
    return this.reviews.listByVendor(ctx.organizationId, vendorId);
  }

  async addRelationship(
    ctx: RequestContext,
    parentVendorId: string,
    input: CreateVendorRelationshipDto,
  ) {
    if (parentVendorId === input.childVendorId) {
      throw new ValidationError("A vendor cannot be its own sub-processor");
    }
    const parent = await this.vendors.findById(
      ctx.organizationId,
      parentVendorId,
    );
    if (!parent) throw new NotFoundError("Parent vendor not found");
    const child = await this.vendors.findById(
      ctx.organizationId,
      input.childVendorId,
    );
    if (!child) throw new NotFoundError("Child vendor not found");

    const rel = await withTransaction(async (tx) => {
      const created = await this.relationships.create(tx, ctx, {
        parentVendorId,
        childVendorId: input.childVendorId,
        relationshipType: input.relationshipType,
        personalDataFlows: input.personalDataFlows,
        notificationRequired: input.notificationRequired,
        notes: input.notes,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.SubProcessorAdded,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          parentVendorId,
          childVendorId: input.childVendorId,
          relationshipId: created.id,
          notificationRequired: created.notificationRequired,
        },
      });

      return created;
    });

    await this.refreshScores(ctx, parentVendorId);
    return rel;
  }

  async listRelationships(ctx: RequestContext, vendorId: string) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");
    return this.relationships.listByParent(ctx.organizationId, vendorId);
  }

  async acknowledgeRelationship(
    ctx: RequestContext,
    vendorId: string,
    relationshipId: string,
  ) {
    const vendor = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");
    const rows = await this.relationships.listByParent(
      ctx.organizationId,
      vendorId,
    );
    const match = rows.find((r) => r.id === relationshipId);
    if (!match) throw new NotFoundError("Relationship not found");
    return withTransaction(async (tx) =>
      this.relationships.acknowledge(tx, relationshipId),
    );
  }

  async analyticsSummary(ctx: RequestContext) {
    const vendors = await this.vendors.list(ctx.organizationId);
    const active = vendors.filter((v) => v.status === "ACTIVE");
    let missingDpa = 0;
    let highRisk = 0;
    let reviewsOverdue = 0;
    let dpaExpiring = 0;
    for (const v of active) {
      const score = await this.buildScorecard(ctx.organizationId, v.id);
      if (score.openRiskFlags.includes("missing_dpa")) missingDpa += 1;
      if (score.openRiskFlags.includes("dpa_expiring")) dpaExpiring += 1;
      if (score.residualRiskScore >= 65) highRisk += 1;
      if (score.openRiskFlags.includes("review_overdue")) reviewsOverdue += 1;
    }
    return {
      totalVendors: vendors.length,
      activeVendors: active.length,
      missingDpa,
      highRisk,
      reviewsOverdue,
      dpaExpiring,
    };
  }

  private async refreshScores(ctx: RequestContext, vendorId: string) {
    const current = await this.vendors.findById(ctx.organizationId, vendorId);
    if (!current) return;
    const scorecard = await this.buildScorecard(ctx.organizationId, vendorId);
    await withTransaction(async (tx) =>
      this.vendors.update(tx, ctx, vendorId, {
        version: current.version,
        inherentRiskScore: scorecard.inherentRiskScore,
        residualRiskScore: scorecard.residualRiskScore,
      }),
    );
  }

  private async buildScorecard(
    organizationId: string,
    vendorId: string,
  ): Promise<VendorRiskScorecard> {
    const vendor = await this.vendors.findById(organizationId, vendorId);
    if (!vendor) throw new NotFoundError("Vendor not found");
    const activeDpa = await this.agreements.findActive(organizationId, vendorId);
    const latestReview = await this.reviews.findLatest(organizationId, vendorId);
    const childCriticalCount = await this.relationships.countCriticalChildren(
      organizationId,
      vendorId,
    );
    return computeVendorRisk({
      vendor,
      hasActiveDpa: Boolean(activeDpa),
      dpaExpiresAt: activeDpa?.expiresAt ?? null,
      latestReviewOutcome: latestReview?.outcome ?? null,
      latestReviewResidual: latestReview?.residualRisk ?? null,
      childCriticalCount,
    });
  }
}

export const vendorService = new VendorService();
