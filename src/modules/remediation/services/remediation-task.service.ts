import { Prisma } from "@prisma/client";

import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { logger } from "../../../infrastructure/logging/logger.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { RemediationTaskRepository } from "../repositories/remediation-task.repository.js";
import { RemediationTaskLifecycleStateMachine } from "../domain/remediation-task-lifecycle.state-machine.js";
import type { UserLookup } from "../interfaces/user-lookup.interface.js";
import { PrismaUserLookup } from "../repositories/user-lookup.adapter.js";
import type { ViolationLookup } from "../interfaces/violation-lookup.interface.js";
import { PrismaViolationLookup } from "../repositories/violation-lookup.adapter.js";
import type { CreateRemediationTaskDto } from "../dto/create-remediation-task.dto.js";
import type { UpdateRemediationTaskDto } from "../dto/update-remediation-task.dto.js";
import type { ListRemediationTasksQuery } from "../dto/remediation-task.dto.js";
import type { RemediationTaskAssignedEventPayload } from "../events/remediation-task-assigned.event.js";
import type { RemediationCompletedEventPayload } from "../events/remediation-completed.event.js";
import {
  toRemediationTaskResponse,
  type RemediationTaskResponse,
  type RemediationTaskRecord,
} from "../types/remediation-task.types.js";

/**
 * Structural view of the ViolationCreated event payload, declared locally —
 * the consuming module owns its own reading of a cross-module event contract
 * (mirrors how violations locally declares ValidationFailedPayload).
 */
export type ViolationCreatedPayload = {
  violationId: string;
  severity?: string;
  title?: string;
  validationResultId?: string;
  evidenceRequiredFlag?: boolean;
};

export class RemediationTaskService {
  constructor(
    private readonly repository = new RemediationTaskRepository(),
    private readonly userLookup: UserLookup = new PrismaUserLookup(),
    private readonly violationLookup: ViolationLookup = new PrismaViolationLookup(),
  ) {}

  /** Manual task creation against an existing violation (PRD: task assigned). */
  async create(
    ctx: RequestContext,
    input: CreateRemediationTaskDto,
  ): Promise<RemediationTaskResponse> {
    await this.assertViolationInOrganization(ctx, input.violationId);

    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    return withTransaction(async (tx) => {
      const task = await this.repository.create(tx, ctx, {
        violationId: input.violationId,
        source: "MANUAL",
        taskTitle: input.taskTitle,
        taskDescription: input.taskDescription,
        assignedTo: input.assignedTo,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      });

      if (task.assignedTo) {
        await this.writeAssignedOutbox(tx, ctx, task, task.assignedTo);
      }

      return toRemediationTaskResponse(task);
    });
  }

  /**
   * Event handler entry point — auto-creates a PENDING task for a violation
   * opened by ViolationCreated. Idempotent: an AUTO task already linked to
   * the same violation is left untouched (partial unique index on
   * [organizationId, violationId] WHERE source = 'AUTO' backs this).
   */
  async createFromViolationCreated(
    ctx: RequestContext,
    payload: ViolationCreatedPayload,
  ): Promise<RemediationTaskResponse | null> {
    if (!payload.violationId) {
      logger.warn({ payload }, "remediation.violation_created_missing_id");
      return null;
    }

    const existing = await this.repository.findAutoTaskByViolation(
      ctx.organizationId,
      payload.violationId,
    );
    if (existing) {
      logger.debug(
        { taskId: existing.id, violationId: payload.violationId },
        "remediation.auto_task_already_exists",
      );
      return toRemediationTaskResponse(existing);
    }

    // The violation must actually exist before we FK-link a task to it.
    const violation = await this.violationLookup.findById(
      ctx.organizationId,
      payload.violationId,
    );
    if (!violation) {
      logger.warn(
        { violationId: payload.violationId },
        "remediation.violation_not_found",
      );
      return null;
    }

    // The payload crosses the event bus — validate this untrusted boundary
    // before persisting (a non-string title would otherwise throw a TypeError
    // inside the worker handler). AUTO titles are capped at the API max.
    const title = this.safeTaskTitle(payload.title);

    return withTransaction(async (tx) => {
      let task;
      try {
        task = await this.repository.create(tx, ctx, {
          violationId: payload.violationId,
          source: "AUTO",
          taskTitle: title,
        });
      } catch (err) {
        // Concurrent handler delivery for the same violation — treat as done.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const raced = await this.repository.findAutoTaskByViolation(
            ctx.organizationId,
            payload.violationId,
          );
          return raced ? toRemediationTaskResponse(raced) : null;
        }
        throw err;
      }

      logger.info(
        { taskId: task.id, violationId: payload.violationId },
        "remediation.task_auto_created",
      );

      return toRemediationTaskResponse(task);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<RemediationTaskResponse> {
    const task = await this.repository.findById(ctx.organizationId, id);

    if (!task) {
      throw new NotFoundError("Remediation task not found");
    }

    return toRemediationTaskResponse(task);
  }

  async list(
    ctx: RequestContext,
    options: ListRemediationTasksQuery = {},
  ): Promise<RemediationTaskResponse[]> {
    const tasks = await this.repository.list(ctx.organizationId, {
      status: options.status,
      violationId: options.violationId,
      assignedTo: options.assignedTo,
    });

    return tasks.map(toRemediationTaskResponse);
  }

  /**
   * Lifecycle update — start / submit / rework / verify / cancel, plus
   * reassignment and field edits. Transitions are validated by the domain
   * state machine; closes go through close(). Optimistic locking via `version`.
   */
  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateRemediationTaskDto,
  ): Promise<RemediationTaskResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Remediation task not found");
    }

    if (input.assignedTo) {
      await this.assertAssigneeInOrganization(ctx, input.assignedTo);
    }

    // Terminal tasks are immutable.
    if (RemediationTaskLifecycleStateMachine.isTerminal(existing.status)) {
      throw new ConflictError(
        `Remediation task is already ${existing.status} and cannot be updated`,
      );
    }

    const nextStatus = input.status ?? existing.status;
    if (
      input.status !== undefined &&
      !RemediationTaskLifecycleStateMachine.canTransition(
        existing.status,
        nextStatus,
      )
    ) {
      throw new ConflictError(
        `Illegal transition ${existing.status} → ${nextStatus} in remediation task lifecycle`,
      );
    }

    return withTransaction(async (tx) => {
      const task = await this.repository.update(tx, ctx, id, input.version, {
        taskTitle: input.taskTitle,
        taskDescription:
          input.taskDescription !== undefined
            ? input.taskDescription
            : undefined,
        status: input.status,
        assignedTo:
          input.assignedTo !== undefined ? input.assignedTo : undefined,
        dueAt:
          input.dueAt !== undefined
            ? input.dueAt === null
              ? null
              : new Date(input.dueAt)
            : undefined,
        verificationNotes:
          input.verificationNotes !== undefined
            ? input.verificationNotes
            : undefined,
        resolutionSummary:
          input.resolutionSummary !== undefined
            ? input.resolutionSummary
            : undefined,
        // Verification stamp — applied once when the task transitions to
        // VERIFIED (PENDING_VERIFICATION → VERIFIED).
        verifiedAt: input.status === "VERIFIED" ? new Date() : undefined,
        verifiedBy: input.status === "VERIFIED" ? ctx.actorUserId : undefined,
      });

      if (!task) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      // Publish assignment only on (re)assignment to a concrete owner.
      if (
        input.assignedTo !== undefined &&
        input.assignedTo !== existing.assignedTo &&
        task.assignedTo
      ) {
        await this.writeAssignedOutbox(tx, ctx, task, task.assignedTo);
      }

      return toRemediationTaskResponse(task);
    });
  }

  /** Close a VERIFIED task — requires prior verification. */
  async close(
    ctx: RequestContext,
    id: string,
    input: { version: number; resolutionSummary: string },
  ): Promise<RemediationTaskResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Remediation task not found");
    }

    if (existing.status !== "VERIFIED") {
      throw new ConflictError(
        `Remediation task must be VERIFIED before closing (current: ${existing.status})`,
      );
    }

    return withTransaction(async (tx) => {
      const task = await this.repository.update(tx, ctx, id, input.version, {
        status: "CLOSED",
        closedAt: new Date(),
        resolutionSummary: input.resolutionSummary,
      });

      if (!task) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      const payload: RemediationCompletedEventPayload = {
        taskId: task.id,
        violationId: task.violationId,
        closedAt:
          task.closedAt?.toISOString() ?? new Date().toISOString(),
        verifiedAt:
          task.verifiedAt?.toISOString() ?? new Date().toISOString(),
        verifiedBy: task.verifiedBy ?? undefined,
        resolutionSummary: task.resolutionSummary ?? undefined,
      };

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.RemediationCompleted,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload,
      });

      return toRemediationTaskResponse(task);
    });
  }

  private async writeAssignedOutbox(
    tx: Prisma.TransactionClient,
    ctx: RequestContext,
    task: RemediationTaskRecord,
    assignedTo: string,
  ): Promise<void> {
    const payload: RemediationTaskAssignedEventPayload = {
      taskId: task.id,
      violationId: task.violationId,
      assignedTo,
      dueAt: task.dueAt ? task.dueAt.toISOString() : undefined,
      assignedAt: new Date().toISOString(),
    };

    await writeOutboxEvent(tx, {
      eventType: DOMAIN_EVENTS.RemediationTaskAssigned,
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      correlationId: ctx.correlationId,
      payload,
    });
  }

  private safeTaskTitle(title: unknown): string {
    if (typeof title !== "string" || title.trim().length === 0) {
      return "Remediation required: violation";
    }
    return `Remediation required: ${title.trim()}`.slice(0, 255);
  }

  private async assertViolationInOrganization(
    ctx: RequestContext,
    violationId: string,
  ): Promise<void> {
    const violation = await this.violationLookup.findById(
      ctx.organizationId,
      violationId,
    );
    if (!violation) {
      throw new NotFoundError("Violation not found");
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

export const remediationTaskService = new RemediationTaskService();
