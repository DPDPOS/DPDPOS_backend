import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { randomBytes } from "node:crypto";
import { hashToken } from "../../auth/utils/token-crypto.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { appConfig } from "../../../config/app.config.js";
import type { CliAuthContext } from "../../assessments/middleware/authenticate-cli.middleware.js";

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
  CreateVendorCliTokenDto,
  UpdateVendorDto,
  VendorCliSyncDto,
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

    const { vendor, parentIds } = await withTransaction(async (tx) => {
      const asChild = await this.relationships.listByChild(
        ctx.organizationId,
        id,
      );
      const parentVendorIds = asChild.map((r) => r.parentVendorId);

      await this.relationships.softDeleteForVendor(tx, ctx.organizationId, id);

      await tx.processingActivity.updateMany({
        where: {
          organizationId: ctx.organizationId,
          vendorId: id,
          deletedAt: null,
        },
        data: { vendorId: null },
      });

      const offboarded = await this.vendors.softDelete(tx, ctx, id);

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.VendorRiskChanged,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          vendorId: id,
          residualRiskScore: existing.residualRiskScore,
          flags: ["offboarded"],
        },
      });

      return {
        vendor: toVendorResponse(offboarded),
        parentIds: parentVendorIds,
      };
    });

    for (const parentId of parentIds) {
      await this.refreshScores(ctx, parentId);
    }

    return vendor;
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
      const status = input.status ?? "DRAFT";
      if (status === "ACTIVE") {
        await this.agreements.supersedeActive(
          tx,
          ctx.organizationId,
          vendorId,
        );
      }

      const created = await this.agreements.create(tx, ctx, vendorId, {
        ...input,
        status,
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

    if (input.evidenceFileIds?.length) {
      const files = await prisma.evidenceFile.findMany({
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          id: { in: input.evidenceFileIds },
        },
        select: { id: true },
      });
      if (files.length !== input.evidenceFileIds.length) {
        throw new ValidationError(
          "Each evidenceFileId must reference an evidence file in this organisation",
        );
      }
    }

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

    if (
      await this.relationships.wouldCreateCycle(
        ctx.organizationId,
        parentVendorId,
        input.childVendorId,
      )
    ) {
      throw new ValidationError(
        "Linking this vendor would create a circular supply-chain relationship",
      );
    }

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
    const row = await withTransaction(async (tx) =>
      this.relationships.acknowledge(tx, relationshipId),
    );
    await this.refreshScores(ctx, vendorId);
    return row;
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
      if (
        score.openRiskFlags.includes("missing_review") ||
        score.openRiskFlags.includes("review_overdue")
      ) {
        reviewsOverdue += 1;
      }
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

  async createCliToken(ctx: RequestContext, dto: CreateVendorCliTokenDto) {
    const raw = `dpdp_${randomBytes(24).toString("base64url")}`;
    const tokenHash = hashToken(raw);
    const expiresAt =
      dto.expiresInDays != null
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const row = await prisma.cliToken.create({
      data: {
        assessmentId: null,
        organizationId: ctx.organizationId,
        label: dto.label?.trim() || "vendors-cli",
        tokenHash,
        tokenPrefix: raw.slice(0, 12),
        expiresAt,
        createdBy: ctx.actorUserId,
      },
    });

    return {
      id: row.id,
      token: raw,
      label: row.label,
      expiresAt: row.expiresAt,
      instructions: {
        install: "npm install -g dpdp-cli",
        login: `dpdp login --token ${raw} --api ${appConfig.apiPublicUrl}`,
        scan: "dpdp vendors scan .",
        sync: "dpdp vendors sync",
      },
    };
  }

  async syncFromCli(cli: CliAuthContext, dto: VendorCliSyncDto) {
    const tokenRow = await prisma.cliToken.findUnique({
      where: { id: cli.cliTokenId },
    });
    if (!tokenRow?.createdBy) {
      throw new ValidationError(
        "CLI token has no creating user; mint a new token from Vendors → Collect from CLI",
      );
    }

    const ctx: RequestContext = {
      correlationId: cli.correlationId,
      organizationId: cli.organizationId,
      actorUserId: tokenRow.createdBy,
      permissions: [],
      roles: [],
    };

    const created: VendorResponse[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const suggestion of dto.suggestions) {
      try {
        const vendor = await this.create(ctx, {
          name: suggestion.name,
          vendorType: "PROCESSOR",
          status: "DRAFT",
          criticality: "MEDIUM",
          services: suggestion.services,
          notes:
            suggestion.notes ??
            "Imported from CLI TPRM scan (dpdp vendors sync)",
        });
        created.push(vendor);
      } catch (err) {
        errors.push({
          name: suggestion.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      createdCount: created.length,
      failedCount: errors.length,
      created: created.map((v) => ({ id: v.id, name: v.name })),
      errors,
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
    const unacknowledgedChildCount =
      await this.relationships.countUnacknowledgedChildren(
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
      unacknowledgedChildCount,
    });
  }

  /**
   * TPRM: validate whether sending PII tags to an endpoint/vendor is covered
   * by an active DPA (and flag cross-border when agreement disallows it).
   */
  async validateDataFlow(
    organizationId: string,
    input: { endpoint: string; piiTags: string[]; vendorId?: string },
  ): Promise<{
    allowed: boolean;
    reasons: string[];
    vendorId: string | null;
    hasActiveDpa: boolean;
    crossBorderAllowed: boolean;
  }> {
    const reasons: string[] = [];
    let vendor =
      input.vendorId
        ? await this.vendors.findById(organizationId, input.vendorId)
        : null;
    if (!vendor) {
      const needle = input.endpoint.trim().toLowerCase();
      const all = await this.vendors.list(organizationId);
      vendor =
        all.find(
          (v) =>
            v.name.toLowerCase().includes(needle) ||
            needle.includes(v.name.toLowerCase()),
        ) ?? null;
    }
    if (!vendor) {
      return {
        allowed: false,
        reasons: ["No registered vendor matches endpoint"],
        vendorId: null,
        hasActiveDpa: false,
        crossBorderAllowed: false,
      };
    }
    const activeDpa = await this.agreements.findActive(
      organizationId,
      vendor.id,
    );
    const hasActiveDpa = Boolean(activeDpa);
    const crossBorderAllowed = Boolean(activeDpa?.crossBorderAllowed);
    if (!hasActiveDpa) {
      reasons.push("Vendor lacks an active DPA");
    }
    if (input.piiTags.length > 0 && !hasActiveDpa) {
      reasons.push(
        `PII tags (${input.piiTags.join(", ")}) require an active DPA`,
      );
    }
    if (input.piiTags.length > 0 && hasActiveDpa && !crossBorderAllowed) {
      reasons.push(
        "Active DPA does not allow cross-border transfer for this flow",
      );
    }
    return {
      allowed: reasons.length === 0,
      reasons,
      vendorId: vendor.id,
      hasActiveDpa,
      crossBorderAllowed,
    };
  }

  /**
   * Compare agent-discovered DataSystems against registered vendors;
   * returns unmapped systems (for ComplianceFinding upsert by callers).
   */
  async flagUnmappedSubprocessors(organizationId: string): Promise<
    Array<{
      systemId: string;
      systemName: string;
      systemType: string;
      reason: string;
    }>
  > {
    const [systems, vendors] = await Promise.all([
      prisma.dataSystem.findMany({ where: { organizationId } }),
      this.vendors.list(organizationId),
    ]);
    const vendorNames = vendors.map((v) => v.name.toLowerCase());
    const findings: Array<{
      systemId: string;
      systemName: string;
      systemType: string;
      reason: string;
    }> = [];
    for (const system of systems) {
      const name = system.name.toLowerCase();
      const matched = vendorNames.some(
        (vn) => name.includes(vn) || vn.includes(name),
      );
      if (!matched) {
        findings.push({
          systemId: system.id,
          systemName: system.name,
          systemType: system.systemType,
          reason: "No registered vendor/sub-processor matches discovered system",
        });
      }
    }
    return findings;
  }
}

export const vendorService = new VendorService();
