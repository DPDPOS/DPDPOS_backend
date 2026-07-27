import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../../../shared/pagination/pagination.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type {
  CreateControlDto,
  ListControlsQuery,
  UpdateControlDto,
} from "../dto/control.dto.js";
import { ControlRepository } from "../repositories/control.repository.js";
import {
  toControlResponse,
  type ControlResponse,
} from "../types/control.types.js";

export class ControlService {
  constructor(private readonly repo = new ControlRepository()) {}

  async list(
    ctx: RequestContext,
    query: ListControlsQuery = {},
  ): Promise<{
    items: ControlResponse[];
    meta: { pagination: ReturnType<typeof buildPaginationMeta> };
  }> {
    const pagination = normalizePagination(query);
    const { items, total } = await this.repo.list({
      organizationId: ctx.organizationId,
      frameworkId: query.frameworkId,
      status: query.status,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      items: items.map(toControlResponse),
      meta: {
        pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
      },
    };
  }

  async create(
    ctx: RequestContext,
    input: CreateControlDto,
  ): Promise<ControlResponse> {
    const code = input.code.trim().toUpperCase();
    const title = input.title.trim();

    const framework = await this.repo.findFrameworkInOrg({
      organizationId: ctx.organizationId,
      frameworkId: input.frameworkId,
    });
    if (!framework) {
      throw new ValidationError(
        "frameworkId must reference a framework in this organization",
      );
    }

    const existing = await this.repo.findByCode({
      organizationId: ctx.organizationId,
      frameworkId: input.frameworkId,
      code,
    });
    if (existing) {
      throw new ConflictError(
        `Control '${code}' already exists on this framework`,
      );
    }

    if (input.ownerUserId) {
      await this.assertOwnerInOrg(ctx.organizationId, input.ownerUserId);
    }

    return withTransaction(async (tx) => {
      const control = await this.repo.create(tx, {
        organizationId: ctx.organizationId,
        frameworkId: input.frameworkId,
        code,
        title,
        description: input.description?.trim(),
        ownerUserId: input.ownerUserId,
        dueAt: input.dueAt,
        legalBasisRef: input.legalBasisRef?.trim(),
        status: input.status,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });
      return toControlResponse(control);
    });
  }

  async update(
    ctx: RequestContext,
    controlId: string,
    input: UpdateControlDto,
  ): Promise<ControlResponse> {
    const existing = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: controlId,
    });
    if (!existing) {
      throw new NotFoundError("Control not found");
    }

    if (input.ownerUserId) {
      await this.assertOwnerInOrg(ctx.organizationId, input.ownerUserId);
    }

    return withTransaction(async (tx) => {
      const updated = await this.repo.update(tx, controlId, {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? {
              description:
                input.description === null ? null : input.description.trim(),
            }
          : {}),
        ...(input.ownerUserId !== undefined
          ? { ownerUserId: input.ownerUserId }
          : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.legalBasisRef !== undefined
          ? {
              legalBasisRef:
                input.legalBasisRef === null
                  ? null
                  : input.legalBasisRef.trim(),
            }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedBy: ctx.actorUserId,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ControlUpdated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          controlId: updated.id,
          status: updated.status,
          ownerUserId: updated.ownerUserId,
          code: updated.code,
        },
      });

      return toControlResponse(updated);
    });
  }

  private async assertOwnerInOrg(
    organizationId: string,
    ownerUserId: string,
  ): Promise<void> {
    const owner = await this.repo.findActiveUserInOrg({
      organizationId,
      userId: ownerUserId,
    });
    if (!owner) {
      throw new ValidationError(
        "ownerUserId must reference an active user in this organization",
      );
    }
  }
}

export const controlService = new ControlService();
