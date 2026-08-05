import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

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
} from "../types/data-subject-request.types.js";

const SLA_MS_PER_DAY = 24 * 60 * 60 * 1000;

export class DataSubjectRequestService {
  constructor(
    private readonly repository = new DataSubjectRequestRepository(),
    private readonly userLookup: UserLookup = new PrismaUserLookup(),
  ) {}

  async submit(
    ctx: RequestContext,
    input: CreateDataSubjectRequestDto,
  ): Promise<DataSubjectRequestResponse> {
    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    const slaDays =
      RIGHTS_REQUEST_SLA_DAYS[input.requestType] ??
      DEFAULT_RIGHTS_REQUEST_SLA_DAYS;
    const dueAt = new Date(Date.now() + slaDays * SLA_MS_PER_DAY);

    return withTransaction(async (tx) => {
      const request = await this.repository.create(tx, ctx, {
        requestType: input.requestType,
        requesterReference: input.requesterReference,
        assignedTo: input.assignedTo,
        dueAt,
      });

      // PII-safe payload: requesterReference deliberately excluded.
      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.RightsRequestSubmitted,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          requestId: request.id,
          requestType: request.requestType,
          dueAt: request.dueAt?.toISOString(),
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

    return requests.map(toDataSubjectRequestResponse);
  }

  /**
   * Assign / transition / log resolution / close.
   * Optimistic locking: `version` in the DTO must match the stored version,
   * otherwise a concurrent edit won the race → 409.
   */
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

    // Status transition legality is enforced by the domain state machine.
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

    // Invariant: CLOSED requires a logged resolution.
    if (nextStatus === "CLOSED" && !input.resolutionSummary?.trim()) {
      throw new ConflictError(
        "A request cannot be closed without a resolution summary",
      );
    }

    // closedAt is set only when actually moving INTO a terminal state — a
    // resolution-only or re-patch on a terminal request must never rewrite it.
    const enteringTerminal =
      (nextStatus === "CLOSED" || nextStatus === "REJECTED") &&
      existing.status !== nextStatus;

    return withTransaction(async (tx) => {
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
          },
        });
      }

      return toDataSubjectRequestResponse(request);
    });
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
