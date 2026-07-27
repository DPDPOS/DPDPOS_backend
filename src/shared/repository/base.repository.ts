import type { RequestContext, TenantScopedQuery } from "../types/request-context.js";

/**
 * Tenant-scoped base repository.
 * Every concrete repository must pass organizationId — org-less queries are not allowed.
 */
export abstract class BaseRepository {
  protected requireOrganizationId(query: TenantScopedQuery): string {
    if (!query.organizationId || query.organizationId.trim().length === 0) {
      throw new Error("organizationId is required for all repository operations");
    }
    return query.organizationId;
  }

  protected tenantWhere(query: TenantScopedQuery): {
    organizationId: string;
    deletedAt?: null;
  } {
    const organizationId = this.requireOrganizationId(query);
    return {
      organizationId,
      ...(query.includeDeleted ? {} : { deletedAt: null }),
    };
  }

  protected auditCreateFields(ctx: RequestContext) {
    return {
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    };
  }

  protected auditUpdateFields(ctx: RequestContext) {
    return {
      updatedBy: ctx.actorUserId,
    };
  }
}
