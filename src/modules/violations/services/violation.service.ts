import { Prisma, type RuleSeverity } from "@prisma/client";

import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { logger } from "../../../infrastructure/logging/logger.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { ValidationResultRepository } from "../../validations/repositories/validation-result.repository.js";
import { ValidationRuleRepository } from "../../validations/repositories/validation-rule.repository.js";

import { ViolationRepository } from "../repositories/violation.repository.js";
import { ViolationLifecycleStateMachine } from "../domain/violation-lifecycle.state-machine.js";
import type { UserLookup } from "../interfaces/user-lookup.interface.js";
import { PrismaUserLookup } from "../repositories/user-lookup.adapter.js";
import {
  VIOLATION_SEVERITIES,
  type CreateViolationDto,
} from "../dto/create-violation.dto.js";
import type { UpdateViolationDto } from "../dto/update-violation.dto.js";
import type { ListViolationsQuery } from "../dto/violation.dto.js";
import type { ViolationCreatedEventPayload } from "../events/violation-created.event.js";
import type { ViolationClosedEventPayload } from "../events/violation-closed.event.js";
import {
  toViolationResponse,
  type ViolationResponse,
} from "../types/violation.types.js";

export type ValidationFailedPayload = {
  runId: string;
  ruleCode: string;
  ruleId: string;
  resultId: string;
  severity: string;
  evidenceRequiredFlag?: boolean;
  explanation?: string;
};

export class ViolationService {
  constructor(
    private readonly repository = new ViolationRepository(),
    private readonly results = new ValidationResultRepository(),
    private readonly rules = new ValidationRuleRepository(),
    private readonly userLookup: UserLookup = new PrismaUserLookup(),
  ) {}

  /** Manual incident creation (PRD: open issue creation). */
  async create(
    ctx: RequestContext,
    input: CreateViolationDto,
  ): Promise<ViolationResponse> {
    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    if (input.validationResultId) {
      await this.assertResultInOrganization(ctx, input.validationResultId);
    }

    return withTransaction(async (tx) => {
      const violation = await this.repository.create(tx, ctx, {
        validationResultId: input.validationResultId,
        severity: input.severity,
        title: input.title,
        description: input.description,
        assignedTo: input.assignedTo,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      });

      const payload: ViolationCreatedEventPayload = {
        violationId: violation.id,
        severity: violation.severity,
        title: violation.title,
        validationResultId: violation.validationResultId ?? undefined,
        evidenceRequiredFlag: violation.evidenceRequiredFlag,
      };

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ViolationCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload,
      });

      return toViolationResponse(violation);
    });
  }

  /**
   * Event handler entry point — opens a Violation for a failed validation.
   * Idempotent: a violation already linked to the same validation result is
   * left untouched (unique [organizationId, validationResultId] backs this).
   */
  async createFromValidationFailed(
    ctx: RequestContext,
    payload: ValidationFailedPayload,
  ): Promise<ViolationResponse | null> {
    if (!payload.resultId) {
      logger.warn({ payload }, "violation.validation_failed_missing_result_id");
      return null;
    }

    const existing = await this.repository.findByValidationResult(
      ctx.organizationId,
      payload.resultId,
    );
    if (existing) {
      logger.debug(
        { violationId: existing.id, resultId: payload.resultId },
        "violation.already_open_for_result",
      );
      return toViolationResponse(existing);
    }

    const result = await this.results.findById(
      ctx.organizationId,
      payload.resultId,
    );
    if (!result) {
      logger.warn(
        { resultId: payload.resultId },
        "violation.validation_result_not_found",
      );
      return null;
    }

    // The payload crosses the event bus — validate the severity at this
    // untrusted boundary before persisting (a bad enum would otherwise throw
    // an unhandled P2003 inside the worker).
    const severity = payload.severity as RuleSeverity;
    if (!VIOLATION_SEVERITIES.includes(severity)) {
      logger.warn(
        { resultId: payload.resultId, severity: payload.severity },
        "violation.invalid_severity_from_event",
      );
      return null;
    }

    const rule = await this.rules.findById(ctx.organizationId, payload.ruleId);

    return withTransaction(async (tx) => {
      let violation;
      try {
        violation = await this.repository.create(tx, ctx, {
          validationResultId: payload.resultId,
          severity,
          title: rule
            ? `Validation failed: ${rule.title}`
            : `Validation failed: ${payload.ruleCode}`,
          description:
            payload.explanation ?? result.explanation ?? undefined,
          evidenceRequiredFlag: payload.evidenceRequiredFlag ?? false,
        });
      } catch (err) {
        // Concurrent handler delivery for the same result — treat as done.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const raced = await this.repository.findByValidationResult(
            ctx.organizationId,
            payload.resultId,
          );
          return raced ? toViolationResponse(raced) : null;
        }
        throw err;
      }

      const outboxPayload: ViolationCreatedEventPayload = {
        violationId: violation.id,
        severity: violation.severity,
        title: violation.title,
        validationResultId: payload.resultId,
        evidenceRequiredFlag: violation.evidenceRequiredFlag,
      };

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ViolationCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: outboxPayload,
      });

      logger.info(
        { violationId: violation.id, resultId: payload.resultId },
        "violation.opened_from_validation",
      );

      return toViolationResponse(violation);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<ViolationResponse> {
    const violation = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!violation) {
      throw new NotFoundError("Violation not found");
    }

    return toViolationResponse(violation);
  }

  async list(
    ctx: RequestContext,
    options: ListViolationsQuery = {},
  ): Promise<ViolationResponse[]> {
    const violations = await this.repository.list(ctx.organizationId, {
      status: options.status,
      severity: options.severity,
      assignedTo: options.assignedTo,
    });

    return violations.map(toViolationResponse);
  }

  /**
   * Lifecycle update — assign / triage / start / request evidence / validate /
   * archive. Transitions are validated by the domain state machine; closes go
   * through close(). Optimistic locking via `version`.
   */
  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateViolationDto,
  ): Promise<ViolationResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Violation not found");
    }

    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    // Terminal violations are immutable.
    if (ViolationLifecycleStateMachine.isTerminal(existing.status)) {
      throw new ConflictError(
        `Violation is already ${existing.status} and cannot be updated`,
      );
    }

    const nextStatus = input.status ?? existing.status;
    if (
      input.status !== undefined &&
      !ViolationLifecycleStateMachine.canTransition(existing.status, nextStatus)
    ) {
      throw new ConflictError(
        `Illegal transition ${existing.status} → ${nextStatus} in violation lifecycle`,
      );
    }

    return withTransaction(async (tx) => {
      const violation = await this.repository.update(
        tx,
        ctx,
        id,
        input.version,
        {
          title: input.title,
          description:
            input.description !== undefined ? input.description : undefined,
          severity: input.severity,
          assignedTo:
            input.assignedTo !== undefined ? input.assignedTo : undefined,
          status: input.status,
          dueAt:
            input.dueAt !== undefined
              ? input.dueAt === null
                ? null
                : new Date(input.dueAt)
              : undefined,
          resolutionSummary:
            input.resolutionSummary !== undefined
              ? input.resolutionSummary
              : undefined,
        },
      );

      if (!violation) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      return toViolationResponse(violation);
    });
  }

  /** Close a VALIDATED violation — requires a resolution summary. */
  async close(
    ctx: RequestContext,
    id: string,
    input: { version: number; resolutionSummary: string },
  ): Promise<ViolationResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Violation not found");
    }

    if (existing.status !== "VALIDATED") {
      throw new ConflictError(
        `Violation must be VALIDATED before closing (current: ${existing.status})`,
      );
    }

    return withTransaction(async (tx) => {
      const violation = await this.repository.update(
        tx,
        ctx,
        id,
        input.version,
        {
          status: "CLOSED",
          resolutionSummary: input.resolutionSummary,
          closedAt: new Date(),
        },
      );

      if (!violation) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      const payload: ViolationClosedEventPayload = {
        violationId: violation.id,
        closedAt:
          violation.closedAt?.toISOString() ?? new Date().toISOString(),
      };

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ViolationClosed,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload,
      });

      return toViolationResponse(violation);
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

  private async assertResultInOrganization(
    ctx: RequestContext,
    resultId: string,
  ): Promise<void> {
    const result = await this.results.findById(ctx.organizationId, resultId);
    if (!result) {
      throw new NotFoundError("Validation Result not found");
    }
  }
}

export const violationService = new ViolationService();
