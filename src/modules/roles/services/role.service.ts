import {
  ConflictError,
  NotFoundError,
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
  CreateRoleDto,
  UpdateRolePermissionsDto,
} from "../dto/role.dto.js";
import { assertPermissionsInCatalog } from "../domain/permission-catalog.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { toRoleResponse, type RoleResponse } from "../types/role.types.js";

export class RoleService {
  constructor(private readonly repo = new RoleRepository()) {}

  async list(
    ctx: RequestContext,
    paginationInput: { page?: number; pageSize?: number } = {},
  ): Promise<{ items: RoleResponse[]; meta: { pagination: ReturnType<typeof buildPaginationMeta> } }> {
    const pagination = normalizePagination(paginationInput);
    const { items, total } = await this.repo.list({
      organizationId: ctx.organizationId,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      items: items.map(toRoleResponse),
      meta: {
        pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
      },
    };
  }

  async create(ctx: RequestContext, input: CreateRoleDto): Promise<RoleResponse> {
    const permissions = assertPermissionsInCatalog(input.permissions);

    const existing = await this.repo.findByName({
      organizationId: ctx.organizationId,
      name: input.name,
    });
    if (existing) {
      throw new ConflictError(`Role '${input.name}' already exists`);
    }

    return withTransaction(async (tx) => {
      const role = await this.repo.create(tx, {
        organizationId: ctx.organizationId,
        name: input.name,
        description: input.description,
        permissions,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.RolePermissionsChanged,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          roleId: role.id,
          permissions: role.permissions,
          action: "created",
        },
      });

      return toRoleResponse(role);
    });
  }

  async updatePermissions(
    ctx: RequestContext,
    roleId: string,
    input: UpdateRolePermissionsDto,
  ): Promise<RoleResponse> {
    const permissions = assertPermissionsInCatalog(input.permissions);

    const existing = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: roleId,
    });
    if (!existing) {
      throw new NotFoundError("Role not found");
    }

    return withTransaction(async (tx) => {
      const role = await this.repo.updatePermissions(
        tx,
        { organizationId: ctx.organizationId, id: roleId },
        {
          permissions,
          updatedBy: ctx.actorUserId,
        },
      );

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.RolePermissionsChanged,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          roleId: role.id,
          permissions: role.permissions,
          previousPermissions: existing.permissions,
          isSystemRole: role.isSystemRole,
        },
      });

      return toRoleResponse(role);
    });
  }
}

export const roleService = new RoleService();
