import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import {
  DataAssetRepository,
  type CreateDataAssetData,
  type UpdateDataAssetData,
} from "../repositories/data-asset.repository.js";

import {
  toDataAssetResponse,
  type DataAssetResponse,
} from "../types/data-asset.types.js";

export class DataAssetService {
  constructor(private readonly repository = new DataAssetRepository()) {}

  private async assertDepartmentInOrg(
    organizationId: string,
    departmentId: string | null | undefined,
  ): Promise<void> {
    if (!departmentId) return;
    const dept = await prisma.department.findFirst({
      where: {
        id: departmentId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!dept) {
      throw new ValidationError(
        "departmentId must reference an active department in this organisation",
      );
    }
  }

  private async assertOwnerInOrg(
    organizationId: string,
    ownerUserId: string | null | undefined,
  ): Promise<void> {
    if (!ownerUserId) return;
    const user = await prisma.user.findFirst({
      where: {
        id: ownerUserId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!user) {
      throw new ValidationError(
        "ownerUserId must reference an active user in this organisation",
      );
    }
  }

  async create(
    ctx: RequestContext,
    input: CreateDataAssetData,
  ): Promise<DataAssetResponse> {
    await this.assertDepartmentInOrg(ctx.organizationId, input.departmentId);
    await this.assertOwnerInOrg(ctx.organizationId, input.ownerUserId);

    return withTransaction(async (tx) => {
      const asset = await this.repository.create(tx, ctx, input);

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.DataAssetCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          dataAssetId: asset.id,
          assetName: asset.assetName,
        },
      });

      return toDataAssetResponse(asset);
    });
  }

  async getById(ctx: RequestContext, id: string): Promise<DataAssetResponse> {
    const asset = await this.repository.findById(ctx.organizationId, id);

    if (!asset) {
      throw new NotFoundError("Data Asset not found");
    }

    return toDataAssetResponse(asset);
  }

  async list(ctx: RequestContext): Promise<DataAssetResponse[]> {
    const assets = await this.repository.list(ctx.organizationId);
    return assets.map(toDataAssetResponse);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateDataAssetData,
  ): Promise<DataAssetResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Data Asset not found");
    }

    if (input.departmentId !== undefined) {
      await this.assertDepartmentInOrg(ctx.organizationId, input.departmentId);
    }
    if (input.ownerUserId !== undefined) {
      await this.assertOwnerInOrg(ctx.organizationId, input.ownerUserId);
    }

    return withTransaction(async (tx) => {
      const asset = await this.repository.update(tx, ctx, id, input);
      return toDataAssetResponse(asset);
    });
  }

  async archive(ctx: RequestContext, id: string): Promise<DataAssetResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Data Asset not found");
    }

    return withTransaction(async (tx) => {
      const asset = await this.repository.archive(tx, ctx, id);
      return toDataAssetResponse(asset);
    });
  }
}

export const dataAssetService = new DataAssetService();
