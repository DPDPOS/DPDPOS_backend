import {
  ConflictError,
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
import type { CreateDepartmentDto } from "../dto/department.dto.js";
import { DepartmentRepository } from "../repositories/department.repository.js";
import {
  toDepartmentResponse,
  type DepartmentResponse,
} from "../types/department.types.js";

export class DepartmentService {
  constructor(private readonly repo = new DepartmentRepository()) {}

  async list(
    ctx: RequestContext,
    paginationInput: { page?: number; pageSize?: number } = {},
  ): Promise<{
    items: DepartmentResponse[];
    meta: { pagination: ReturnType<typeof buildPaginationMeta> };
  }> {
    const pagination = normalizePagination(paginationInput);
    const { items, total } = await this.repo.list({
      organizationId: ctx.organizationId,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      items: items.map(toDepartmentResponse),
      meta: {
        pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
      },
    };
  }

  async create(
    ctx: RequestContext,
    input: CreateDepartmentDto,
  ): Promise<DepartmentResponse> {
    const name = input.name.trim();

    const existing = await this.repo.findByName({
      organizationId: ctx.organizationId,
      name,
    });
    if (existing) {
      throw new ConflictError(`Department '${name}' already exists`);
    }

    if (input.headUserId) {
      const head = await this.repo.findActiveUserInOrg({
        organizationId: ctx.organizationId,
        userId: input.headUserId,
      });
      if (!head) {
        throw new ValidationError(
          "headUserId must reference an active user in this organization",
        );
      }
    }

    return withTransaction(async (tx) => {
      const department = await this.repo.create(tx, {
        organizationId: ctx.organizationId,
        name,
        headUserId: input.headUserId,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.DepartmentCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          departmentId: department.id,
          name: department.name,
          headUserId: department.headUserId,
        },
      });

      return toDepartmentResponse(department);
    });
  }
}

export const departmentService = new DepartmentService();
