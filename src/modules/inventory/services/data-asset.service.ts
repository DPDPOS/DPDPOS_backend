import { NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

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
  constructor(
    private readonly repository = new DataAssetRepository(),
  ) {}

  async create(
    ctx: RequestContext,
    input: CreateDataAssetData,
  ): Promise<DataAssetResponse> {
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

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<DataAssetResponse> {
    const asset = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!asset) {
      throw new NotFoundError("Data Asset not found");
    }

    return toDataAssetResponse(asset);
  }

  async list(
    ctx: RequestContext,
  ): Promise<DataAssetResponse[]> {
    const assets = await this.repository.list(
      ctx.organizationId,
    );

    return assets.map(toDataAssetResponse);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateDataAssetData,
  ): Promise<DataAssetResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Data Asset not found");
    }

    return withTransaction(async (tx) => {
      const asset = await this.repository.update(
        tx,
        ctx,
        id,
        input,
      );

      // TODO(Developer A):
      // Add DOMAIN_EVENTS.DataAssetUpdated to the shared
      // event catalog. Once available, publish the
      // DataAssetUpdated outbox event here.

      return toDataAssetResponse(asset);
    });
  }

  async archive(
    ctx: RequestContext,
    id: string,
  ): Promise<DataAssetResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Data Asset not found");
    }

    return withTransaction(async (tx) => {
      const asset = await this.repository.archive(
        tx,
        ctx,
        id,
      );

      // TODO(Developer A):
      // Add DOMAIN_EVENTS.DataAssetArchived to the shared
      // event catalog. Once available, publish the
      // DataAssetArchived outbox event here.

      return toDataAssetResponse(asset);
    });
  }
}

export const dataAssetService = new DataAssetService();