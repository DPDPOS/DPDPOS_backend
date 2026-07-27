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
  CreateRequirementDto,
  ListRequirementsQuery,
  MapRequirementDto,
} from "../dto/requirement.dto.js";
import { RequirementRepository } from "../repositories/requirement.repository.js";
import {
  toRequirementResponse,
  type RequirementResponse,
} from "../types/requirement.types.js";

export class RequirementService {
  constructor(private readonly repo = new RequirementRepository()) {}

  async list(
    ctx: RequestContext,
    query: ListRequirementsQuery = {},
  ): Promise<{
    items: RequirementResponse[];
    meta: { pagination: ReturnType<typeof buildPaginationMeta> };
  }> {
    const pagination = normalizePagination(query);
    const { items, total } = await this.repo.list({
      organizationId: ctx.organizationId,
      frameworkId: query.frameworkId,
      controlId: query.controlId,
      unmapped: query.unmapped,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      items: items.map(toRequirementResponse),
      meta: {
        pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
      },
    };
  }

  async create(
    ctx: RequestContext,
    input: CreateRequirementDto,
  ): Promise<RequirementResponse> {
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

    if (input.controlId) {
      await this.assertControlOnFramework(
        ctx.organizationId,
        input.frameworkId,
        input.controlId,
      );
    }

    const existing = await this.repo.findByCode({
      organizationId: ctx.organizationId,
      frameworkId: input.frameworkId,
      code,
    });
    if (existing) {
      throw new ConflictError(
        `Requirement '${code}' already exists on this framework`,
      );
    }

    return withTransaction(async (tx) => {
      const requirement = await this.repo.create(tx, {
        organizationId: ctx.organizationId,
        frameworkId: input.frameworkId,
        controlId: input.controlId ?? null,
        code,
        title,
        description: input.description?.trim(),
        legalBasisRef: input.legalBasisRef?.trim(),
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });

      if (requirement.controlId) {
        await this.writeMappedEvent(tx, ctx, requirement.id, requirement.controlId);
      }

      return toRequirementResponse(requirement);
    });
  }

  /**
   * Maps an existing requirement to a control in the same framework.
   * Emits RequirementMapped.
   */
  async mapToControl(
    ctx: RequestContext,
    requirementId: string,
    input: MapRequirementDto,
  ): Promise<RequirementResponse> {
    const existing = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: requirementId,
    });
    if (!existing) {
      throw new NotFoundError("Requirement not found");
    }

    await this.assertControlOnFramework(
      ctx.organizationId,
      existing.frameworkId,
      input.controlId,
    );

    return withTransaction(async (tx) => {
      const updated = await this.repo.mapToControl(tx, requirementId, {
        controlId: input.controlId,
        updatedBy: ctx.actorUserId,
      });

      await this.writeMappedEvent(tx, ctx, updated.id, updated.controlId!);

      return toRequirementResponse(updated);
    });
  }

  private async assertControlOnFramework(
    organizationId: string,
    frameworkId: string,
    controlId: string,
  ): Promise<void> {
    const control = await this.repo.findControlInOrg({
      organizationId,
      controlId,
      frameworkId,
    });
    if (!control) {
      throw new ValidationError(
        "controlId must reference a control on the same framework in this organization",
      );
    }
  }

  private async writeMappedEvent(
    tx: Parameters<Parameters<typeof withTransaction>[0]>[0],
    ctx: RequestContext,
    requirementId: string,
    controlId: string,
  ): Promise<void> {
    await writeOutboxEvent(tx, {
      eventType: DOMAIN_EVENTS.RequirementMapped,
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      correlationId: ctx.correlationId,
      payload: {
        requirementId,
        controlId,
      },
    });
  }
}

export const requirementService = new RequirementService();
