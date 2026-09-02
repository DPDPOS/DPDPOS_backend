import {
  Prisma,
  type FindingSource,
  type RuleSeverity,
} from "@prisma/client";

import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { resolveFrameworkCode } from "../../controls/domain/control-catalog.js";

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
  entityType?: string;
  entityId?: string;
  agentId?: string;
};

export type OpenOrDedupeViolationInput = {
  findingSource: FindingSource;
  ruleOrControlCode: string;
  entityType: string;
  entityId: string;
  severity: RuleSeverity;
  title: string;
  description?: string;
  assessmentId?: string;
  agentId?: string;
  complianceFindingId?: string;
  correlationId?: string;
  validationResultId?: string;
  controlId?: string;
  assessmentControlCode?: string;
  sourceKey?: string;
  evidenceRequiredFlag?: boolean;
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
        findingSource: "MANUAL",
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

  async openOrDedupe(
    ctx: RequestContext,
    input: OpenOrDedupeViolationInput,
  ): Promise<{ violation: ViolationResponse; created: boolean }> {
    const dedupeKey = `${input.ruleOrControlCode}|${input.entityType}|${input.entityId}`;

    return withTransaction(async (tx) => {
      // Serialize this organization/key pair so concurrent event delivery
      // cannot create two OPEN violations in the absence of a partial index.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${ctx.organizationId}|${dedupeKey}`}, 0)
        )
      `;
      const existing = await this.repository.refreshOpenByDedupeKey(
        tx,
        ctx,
        dedupeKey,
      );
      if (existing) {
        return { violation: toViolationResponse(existing), created: false };
      }

      const violation = await this.repository.create(tx, ctx, {
        validationResultId: input.validationResultId,
        controlId: input.controlId,
        assessmentControlCode: input.assessmentControlCode,
        sourceKey: input.sourceKey ?? dedupeKey,
        findingSource: input.findingSource,
        dedupeKey,
        complianceFindingId: input.complianceFindingId,
        agentId: input.agentId,
        assessmentId: input.assessmentId,
        severity: input.severity,
        title: input.title,
        description: input.description,
        evidenceRequiredFlag: input.evidenceRequiredFlag,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ViolationCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: input.correlationId ?? ctx.correlationId,
        payload: {
          violationId: violation.id,
          severity: violation.severity,
          title: violation.title,
          validationResultId: violation.validationResultId ?? undefined,
          evidenceRequiredFlag: violation.evidenceRequiredFlag,
        },
      });
      return { violation: toViolationResponse(violation), created: true };
    });
  }

  /**
   * Opens a Violation from an assessment FAIL control so remediation AUTO-tasks
   * follow the existing ViolationCreated → remediation path.
   * Idempotent on sourceKey = assessment:{id}:v{n}:{controlCode}.
   */
  async createFromAssessmentControlFail(
    ctx: RequestContext,
    input: {
      assessmentId: string;
      assessmentName: string;
      versionNumber: number;
      controlCode: string;
      severity: string;
      reasoning: string;
    },
  ): Promise<ViolationResponse | null> {
    const sourceKey = `assessment:${input.assessmentId}:v${input.versionNumber}:${input.controlCode}`;
    const severity = (
      VIOLATION_SEVERITIES.includes(input.severity as (typeof VIOLATION_SEVERITIES)[number])
        ? input.severity
        : "HIGH"
    ) as RuleSeverity;

    const frameworkControlCode = resolveFrameworkCode(input.controlCode);
    let controlId: string | undefined;
    if (frameworkControlCode) {
      const framework = await prisma.framework.findFirst({
        where: {
          organizationId: ctx.organizationId,
          status: "PUBLISHED",
          deletedAt: null,
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true },
      });
      if (framework) {
        const control = await prisma.control.findFirst({
          where: {
            organizationId: ctx.organizationId,
            frameworkId: framework.id,
            code: frameworkControlCode,
            deletedAt: null,
          },
          select: { id: true },
        });
        controlId = control?.id;
      }
    }

    const result = await this.openOrDedupe(ctx, {
      findingSource: "ASSESSMENT",
      ruleOrControlCode: input.controlCode,
      entityType: "Assessment",
      entityId: input.assessmentId,
      severity,
      title: `[Assessment] ${input.controlCode} failed — ${input.assessmentName}`,
      description: `Readiness evaluation v${input.versionNumber} marked ${input.controlCode} as FAIL.\n\n${input.reasoning}\n\nClose this after remediating and re-evaluate the assessment version.`,
      assessmentId: input.assessmentId,
      controlId,
      assessmentControlCode: input.controlCode,
      sourceKey,
      evidenceRequiredFlag: true,
    });
    return result.violation;
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

    if (payload.entityType && payload.entityId) {
      const opened = await this.openOrDedupe(ctx, {
        findingSource: "VALIDATION",
        ruleOrControlCode: payload.ruleCode,
        entityType: payload.entityType,
        entityId: payload.entityId,
        severity,
        title: rule
          ? `Validation failed: ${rule.title}`
          : `Validation failed: ${payload.ruleCode}`,
        description: payload.explanation ?? result.explanation ?? undefined,
        validationResultId: payload.resultId,
        agentId: payload.agentId,
        evidenceRequiredFlag: payload.evidenceRequiredFlag ?? false,
      });
      return opened.violation;
    }

    return withTransaction(async (tx) => {
      let violation;
      try {
        violation = await this.repository.create(tx, ctx, {
          validationResultId: payload.resultId,
          findingSource: "VALIDATION",
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
      findingSource: options.findingSource,
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
        title: violation.title,
        assignedTo: violation.assignedTo,
        resolutionSummary: violation.resolutionSummary,
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
