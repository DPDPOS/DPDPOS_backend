import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import type { UserLookup } from "../interfaces/user-lookup.interface.js";
import { PrismaUserLookup } from "../repositories/user-lookup.adapter.js";
import {
  DataSubjectRequestRepository,
  type ListDataSubjectRequestsOptions,
} from "../repositories/data-subject-request.repository.js";
import {
  DEFAULT_RIGHTS_REQUEST_SLA_DAYS,
  RIGHTS_REQUEST_SLA_DAYS,
  RightsRequestStateMachine,
} from "../domain/rights-request-lifecycle.state-machine.js";
import type {
  CreateDataSubjectRequestDto,
  UpdateDataSubjectRequestDto,
} from "../dto/data-subject-request.dto.js";
import {
  toDataSubjectRequestResponse,
  type DataSubjectRequestResponse,
  type VerificationChecklistItem,
} from "../types/data-subject-request.types.js";

const SLA_MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeRequesterReference(value: string): string {
  return value.trim().toLowerCase();
}

function routingMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function notifyRequesterEmail(
  requesterReference: string,
  subject: string,
  text: string,
): Promise<void> {
  const ref = requesterReference.trim();
  if (!ref.includes("@")) return;
  const { getEmailProvider } = await import(
    "../../../infrastructure/email/ses-email.provider.js"
  );
  await getEmailProvider().sendText({ recipient: ref, subject, text });
}

export class DataSubjectRequestService {
  constructor(
    private readonly repository = new DataSubjectRequestRepository(),
    private readonly userLookup: UserLookup = new PrismaUserLookup(),
  ) {}

  async submit(
    ctx: RequestContext,
    input: CreateDataSubjectRequestDto,
  ): Promise<DataSubjectRequestResponse> {
    const normalized = normalizeRequesterReference(input.requesterReference);

    const existingOpen = await this.repository.findOpenByRequesterAndType(
      ctx.organizationId,
      normalized,
      input.requestType,
    );
    if (existingOpen) {
      return toDataSubjectRequestResponse(existingOpen, { deduped: true });
    }

    let assignedTo = input.assignedTo;
    if (assignedTo) {
      await this.assertAssigneeInOrganization(ctx, assignedTo);
    } else {
      const org = await prisma.organization.findFirst({
        where: { id: ctx.organizationId, deletedAt: null },
        select: { dsrRoutingJson: true },
      });
      const routeUserId = routingMap(org?.dsrRoutingJson)[input.requestType];
      if (routeUserId) {
        const ok = await this.userLookup.existsInOrganization(
          ctx.organizationId,
          routeUserId,
        );
        if (ok) assignedTo = routeUserId;
      }
    }

    const slaDays =
      RIGHTS_REQUEST_SLA_DAYS[input.requestType] ??
      DEFAULT_RIGHTS_REQUEST_SLA_DAYS;
    const dueAt = new Date(Date.now() + slaDays * SLA_MS_PER_DAY);

    let checklist: VerificationChecklistItem[] | undefined;
    if (input.requestType === "ERASURE") {
      const vendors = await prisma.vendor.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, name: true },
        take: 100,
      });
      checklist = vendors.map((v) => ({
        key: `vendor:${v.id}`,
        label: `Confirm erasure / retention with ${v.name}`,
        vendorId: v.id,
        pending: true,
        notes: null,
      }));
    }

    return withTransaction(async (tx) => {
      const request = await this.repository.create(tx, ctx, {
        requestType: input.requestType,
        requesterReference: input.requesterReference.trim(),
        assignedTo,
        dueAt,
        verificationChecklistJson: checklist,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.RightsRequestSubmitted,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          requestId: request.id,
          requestType: request.requestType,
          dueAt: request.dueAt?.toISOString(),
          assignedTo: request.assignedTo,
          hasRequesterContact: Boolean(request.requesterReference?.includes("@")),
        },
      });

      return toDataSubjectRequestResponse(request);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<DataSubjectRequestResponse> {
    const request = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!request) {
      throw new NotFoundError("Data Subject Request not found");
    }

    return toDataSubjectRequestResponse(request);
  }

  async list(
    ctx: RequestContext,
    options: ListDataSubjectRequestsOptions = {},
  ): Promise<DataSubjectRequestResponse[]> {
    const requests = await this.repository.list(
      ctx.organizationId,
      options,
    );

    return requests.map((r) => toDataSubjectRequestResponse(r));
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateDataSubjectRequestDto,
  ): Promise<DataSubjectRequestResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Data Subject Request not found");
    }

    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    const nextStatus = input.status ?? existing.status;
    if (input.status !== undefined) {
      if (RightsRequestStateMachine.isTerminal(existing.status)) {
        throw new ConflictError(
          `Request is already ${existing.status} and cannot be updated further`,
        );
      }
      if (
        input.status !== existing.status &&
        !RightsRequestStateMachine.canTransition(existing.status, nextStatus)
      ) {
        throw new ConflictError(
          `Illegal transition ${existing.status} → ${nextStatus} in rights request lifecycle`,
        );
      }
    }

    if (nextStatus === "CLOSED" && !input.resolutionSummary?.trim()) {
      throw new ConflictError(
        "A request cannot be closed without a resolution summary",
      );
    }

    const enteringTerminal =
      (nextStatus === "CLOSED" || nextStatus === "REJECTED") &&
      existing.status !== nextStatus;

    const statusChanged =
      input.status !== undefined && input.status !== existing.status;

    const result = await withTransaction(async (tx) => {
      const request = await this.repository.update(
        tx,
        ctx,
        id,
        input.version,
        {
          assignedTo:
            input.assignedTo !== undefined ? input.assignedTo : undefined,
          status: input.status,
          resolutionSummary:
            input.resolutionSummary !== undefined
              ? input.resolutionSummary
              : undefined,
          closedAt: enteringTerminal ? new Date() : undefined,
          verificationChecklistJson:
            input.verificationChecklist !== undefined
              ? input.verificationChecklist
              : undefined,
        },
      );

      if (!request) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      if (enteringTerminal && nextStatus === "CLOSED") {
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.RightsRequestClosed,
          organizationId: ctx.organizationId,
          actorUserId: ctx.actorUserId,
          correlationId: ctx.correlationId,
          payload: {
            requestId: request.id,
            closedAt: request.closedAt?.toISOString(),
            requestType: request.requestType,
          },
        });
      }

      return toDataSubjectRequestResponse(request);
    });

    if (statusChanged && (nextStatus === "IN_PROGRESS" || nextStatus === "CLOSED")) {
      await notifyRequesterEmail(
        existing.requesterReference,
        `Your data rights request is now ${nextStatus}`,
        `Your ${existing.requestType} request (${existing.id}) is now ${nextStatus}.`,
      );
    }

    if (
      enteringTerminal &&
      nextStatus === "CLOSED" &&
      existing.requestType === "ERASURE"
    ) {
      await this.enqueueErasureVendorRemediations(ctx, existing.id, existing.verificationChecklistJson);
    }

    return result;
  }

  /**
   * Phase 6: on ERASURE close, ensure erasure checklist items exist for vendors
   * still pending confirmation (staff follow-up / agent dispatch later).
   */
  private async enqueueErasureVendorRemediations(
    ctx: RequestContext,
    requestId: string,
    checklist: VerificationChecklistItem[] | null,
  ): Promise<void> {
    const pending = (checklist ?? []).filter((c) => c.pending && c.vendorId);
    for (const item of pending) {
      const existing = await prisma.erasureChecklistItem.findFirst({
        where: {
          dataSubjectRequestId: requestId,
          vendorId: item.vendorId!,
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.erasureChecklistItem
        .create({
          data: {
            organizationId: ctx.organizationId,
            dataSubjectRequestId: requestId,
            vendorId: item.vendorId!,
            systemKey: item.key,
            systemLabel: item.label,
            status: "PENDING",
          },
        })
        .catch(() => undefined);
    }
  }

  private async assertAssigneeInOrganization(
    ctx: RequestContext,
    userId: string,
  ): Promise<void> {
    const exists = await this.userLookup.existsInOrganization(
      ctx.organizationId,
      userId,
    );
    if (!exists) {
      throw new NotFoundError("Assigned user not found");
    }
  }
}

export const dataSubjectRequestService = new DataSubjectRequestService();
