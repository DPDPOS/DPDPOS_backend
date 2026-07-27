import type { UserStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../../../shared/pagination/pagination.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { hashToken } from "../../auth/utils/token-crypto.js";
import type { CreateUserDto, UpdateUserDto } from "../dto/user.dto.js";
import { UserRepository } from "../repositories/user.repository.js";
import { toUserResponse, type UserResponse } from "../types/user.types.js";

const ALLOWED_STATUSES: UserStatus[] = ["ACTIVE", "INVITED", "DISABLED"];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteUserResult = UserResponse & {
  /** One-time plaintext invite token — deliver out-of-band (email). */
  inviteToken: string;
  inviteExpiresAt: string;
};

export class UserService {
  constructor(private readonly repo = new UserRepository()) {}

  async list(
    ctx: RequestContext,
    paginationInput: { page?: number; pageSize?: number } = {},
  ): Promise<{
    items: UserResponse[];
    meta: { pagination: ReturnType<typeof buildPaginationMeta> };
  }> {
    const pagination = normalizePagination(paginationInput);
    const { items, total } = await this.repo.list({
      organizationId: ctx.organizationId,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      items: items.map(toUserResponse),
      meta: {
        pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
      },
    };
  }

  async invite(ctx: RequestContext, input: CreateUserDto): Promise<InviteUserResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.repo.findByEmail({
      organizationId: ctx.organizationId,
      email,
    });
    if (existing) {
      throw new ConflictError(`User with email '${email}' already exists`);
    }

    const roles = await this.resolveRoles(ctx.organizationId, input.roleIds);
    const roleIds = roles.map((r) => r.id);
    const roleNames = roles.map((r) => r.name);

    const inviteToken = randomBytes(32).toString("base64url");
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    return withTransaction(async (tx) => {
      const user = await this.repo.create(tx, {
        organizationId: ctx.organizationId,
        email,
        name: input.name.trim(),
        status: "INVITED",
        inviteTokenHash: hashToken(inviteToken),
        inviteExpiresAt,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });

      await this.repo.assignRoles(tx, {
        organizationId: ctx.organizationId,
        userId: user.id,
        roleIds,
        assignedBy: ctx.actorUserId,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.UserInvited,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          userId: user.id,
          email: user.email,
          invitedBy: ctx.actorUserId,
          roleIds,
          inviteExpiresAt: inviteExpiresAt.toISOString(),
        },
      });

      for (const roleId of roleIds) {
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.RoleAssigned,
          organizationId: ctx.organizationId,
          actorUserId: ctx.actorUserId,
          correlationId: ctx.correlationId,
          payload: {
            userId: user.id,
            roleId,
          },
        });
      }

      return {
        ...toUserResponse({
          ...user,
          roleIds,
          roleNames,
        }),
        inviteToken,
        inviteExpiresAt: inviteExpiresAt.toISOString(),
      };
    });
  }

  async update(
    ctx: RequestContext,
    userId: string,
    input: UpdateUserDto,
  ): Promise<UserResponse> {
    const existing = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: userId,
    });
    if (!existing) {
      throw new NotFoundError("User not found");
    }

    if (input.status !== undefined && !ALLOWED_STATUSES.includes(input.status)) {
      throw new ValidationError("Invalid user status", {
        allowed: ALLOWED_STATUSES,
      });
    }

    await this.repo.update(
      prisma,
      { organizationId: ctx.organizationId, id: userId },
      {
        name: input.name?.trim(),
        status: input.status,
        updatedBy: ctx.actorUserId,
      },
    );

    const updated = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: userId,
    });
    if (!updated) {
      throw new NotFoundError("User not found");
    }
    return toUserResponse(updated);
  }

  private async resolveRoles(
    organizationId: string,
    requestedRoleIds: string[] | undefined,
  ): Promise<Array<{ id: string; name: string }>> {
    if (requestedRoleIds && requestedRoleIds.length > 0) {
      const uniqueIds = [...new Set(requestedRoleIds)];
      const found = await this.repo.findRolesByIds({
        organizationId,
        roleIds: uniqueIds,
      });
      if (found.length !== uniqueIds.length) {
        throw new ValidationError("One or more roleIds are invalid for this organization", {
          requested: uniqueIds,
          found: found.map((r) => r.id),
        });
      }
      return found;
    }

    const member = await this.repo.findRoleByName({
      organizationId,
      name: "MEMBER",
    });
    if (!member) {
      throw new ValidationError("Default MEMBER role is missing for this organization");
    }
    return [member];
  }
}

export const userService = new UserService();
