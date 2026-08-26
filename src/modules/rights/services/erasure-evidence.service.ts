import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

const DEFAULT_COOLING_OFF_DAYS = 15;

/**
 * Trace-parity erasure: soft-delete with cooling-off, multi-system checklist
 * (internal + vendors), then hard-delete evidence pack.
 */
export class ErasureEvidenceService {
  async startErasure(
    ctx: RequestContext,
    requestId: string,
    options: { immediate?: boolean; coolingOffDays?: number } = {},
  ) {
    const request = await prisma.dataSubjectRequest.findFirst({
      where: {
        id: requestId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!request) throw new NotFoundError("Data subject request not found");
    if (request.requestType !== "ERASURE") {
      throw new ValidationError("Erasure workflow only applies to ERASURE requests");
    }

    const immediate = options.immediate === true;
    const days = options.coolingOffDays ?? DEFAULT_COOLING_OFF_DAYS;
    const coolingOffUntil = immediate
      ? null
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const vendors = await prisma.vendor.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
      take: 100,
    });

    const checklistSeed = [
      {
        systemKey: "internal_crm",
        systemLabel: "Internal CRM / customer systems",
        vendorId: null as string | null,
      },
      {
        systemKey: "consent_store",
        systemLabel: "Consent records",
        vendorId: null,
      },
      {
        systemKey: "analytics",
        systemLabel: "Analytics / logs (where identifiable)",
        vendorId: null,
      },
      ...vendors.map((v) => ({
        systemKey: `vendor:${v.id}`,
        systemLabel: `Vendor: ${v.name}`,
        vendorId: v.id as string | null,
      })),
    ];

    return withTransaction(async (tx) => {
      await tx.dataSubjectRequest.update({
        where: { id: requestId },
        data: {
          immediateErase: immediate,
          coolingOffUntil,
          softDeletedAt: new Date(),
          updatedBy: ctx.actorUserId,
        },
      });

      for (const item of checklistSeed) {
        await tx.erasureChecklistItem.upsert({
          where: {
            dataSubjectRequestId_systemKey: {
              dataSubjectRequestId: requestId,
              systemKey: item.systemKey,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            dataSubjectRequestId: requestId,
            systemKey: item.systemKey,
            systemLabel: item.systemLabel,
            vendorId: item.vendorId,
            status: "PENDING",
          },
          update: {},
        });
      }

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ErasureSoftDeleted,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          requestId,
          immediate,
          coolingOffUntil: coolingOffUntil?.toISOString() ?? null,
          checklistCount: checklistSeed.length,
        },
      });

      return this.getErasurePack(ctx, requestId);
    });
  }

  async confirmChecklistItem(
    ctx: RequestContext,
    requestId: string,
    input: { systemKey: string; status: "DONE" | "SKIPPED" | "FAILED"; notes?: string },
  ) {
    const item = await prisma.erasureChecklistItem.findFirst({
      where: {
        organizationId: ctx.organizationId,
        dataSubjectRequestId: requestId,
        systemKey: input.systemKey,
      },
    });
    if (!item) throw new NotFoundError("Checklist item not found");

    return prisma.erasureChecklistItem.update({
      where: { id: item.id },
      data: {
        status: input.status,
        notes: input.notes,
        confirmedAt: new Date(),
        confirmedBy: ctx.actorUserId,
      },
    });
  }

  async completeHardErase(ctx: RequestContext, requestId: string) {
    const request = await prisma.dataSubjectRequest.findFirst({
      where: {
        id: requestId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!request) throw new NotFoundError("Data subject request not found");
    if (!request.softDeletedAt) {
      throw new ValidationError("Start erasure (soft-delete) before hard erase");
    }
    if (
      !request.immediateErase &&
      request.coolingOffUntil &&
      request.coolingOffUntil.getTime() > Date.now()
    ) {
      throw new ConflictError(
        `Cooling-off until ${request.coolingOffUntil.toISOString()}; use immediate erase or wait`,
      );
    }

    const items = await prisma.erasureChecklistItem.findMany({
      where: { dataSubjectRequestId: requestId },
    });
    const pending = items.filter((i) => i.status === "PENDING" || i.status === "IN_PROGRESS");
    if (pending.length > 0) {
      throw new ConflictError(
        `${pending.length} checklist item(s) still pending confirmation`,
      );
    }

    const evidence = {
      requestId,
      requesterReference: request.requesterReference,
      softDeletedAt: request.softDeletedAt.toISOString(),
      hardDeletedAt: new Date().toISOString(),
      coolingOffUntil: request.coolingOffUntil?.toISOString() ?? null,
      immediateErase: request.immediateErase,
      systems: items.map((i) => ({
        systemKey: i.systemKey,
        systemLabel: i.systemLabel,
        vendorId: i.vendorId,
        status: i.status,
        confirmedAt: i.confirmedAt?.toISOString() ?? null,
        confirmedBy: i.confirmedBy,
        notes: i.notes,
      })),
    };

    return withTransaction(async (tx) => {
      await tx.dataSubjectRequest.update({
        where: { id: requestId },
        data: {
          hardDeletedAt: new Date(),
          erasureEvidenceJson: evidence,
          status: "CLOSED",
          closedAt: new Date(),
          resolutionSummary:
            request.resolutionSummary ??
            "Erasure completed with multi-system evidence pack",
          updatedBy: ctx.actorUserId,
          version: { increment: 1 },
        },
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ErasureCompleted,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          requestId,
          systemsConfirmed: items.length,
        },
      });

      return evidence;
    });
  }

  async getErasurePack(ctx: RequestContext, requestId: string) {
    const request = await prisma.dataSubjectRequest.findFirst({
      where: {
        id: requestId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!request) throw new NotFoundError("Data subject request not found");

    const items = await prisma.erasureChecklistItem.findMany({
      where: { dataSubjectRequestId: requestId },
      orderBy: { createdAt: "asc" },
    });

    return {
      requestId,
      requestType: request.requestType,
      status: request.status,
      immediateErase: request.immediateErase,
      coolingOffUntil: request.coolingOffUntil?.toISOString() ?? null,
      softDeletedAt: request.softDeletedAt?.toISOString() ?? null,
      hardDeletedAt: request.hardDeletedAt?.toISOString() ?? null,
      evidence: request.erasureEvidenceJson,
      checklist: items.map((i) => ({
        id: i.id,
        systemKey: i.systemKey,
        systemLabel: i.systemLabel,
        vendorId: i.vendorId,
        status: i.status,
        confirmedAt: i.confirmedAt?.toISOString() ?? null,
        notes: i.notes,
      })),
    };
  }
}

export const erasureEvidenceService = new ErasureEvidenceService();
