import { NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataAssetRepository } from "../repositories/data-asset.repository.js";
import {
  ProcessingActivityRepository,
  type CreateProcessingActivityData,
  type UpdateProcessingActivityData,
} from "../repositories/processing-activity.repository.js";

import {
  toProcessingActivityResponse,
  type ProcessingActivityResponse,
} from "../types/processing-activity.types.js";

export class ProcessingActivityService {
  constructor(
    private readonly repository = new ProcessingActivityRepository(),
    private readonly dataAssetRepository = new DataAssetRepository(),
  ) {}

  async create(
    ctx: RequestContext,
    input: CreateProcessingActivityData,
  ): Promise<ProcessingActivityResponse> {
    // Business rule: a processing activity must reference a data asset
    // that belongs to the caller's organization.
    const asset = await this.dataAssetRepository.findById(
      ctx.organizationId,
      input.dataAssetId,
    );

    if (!asset) {
      throw new NotFoundError("Data Asset not found");
    }

    return withTransaction(async (tx) => {
      const activity = await this.repository.create(tx, ctx, input);

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ProcessingActivityCreated,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          processingActivityId: activity.id,
          dataAssetId: activity.dataAssetId,
        },
      });

      return toProcessingActivityResponse(activity);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<ProcessingActivityResponse> {
    const activity = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!activity) {
      throw new NotFoundError("Processing Activity not found");
    }

    return toProcessingActivityResponse(activity);
  }

  async list(
    ctx: RequestContext,
    options: { dataAssetId?: string } = {},
  ): Promise<ProcessingActivityResponse[]> {
    const activities = await this.repository.list(
      ctx.organizationId,
      options,
    );

    return activities.map(toProcessingActivityResponse);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateProcessingActivityData,
  ): Promise<ProcessingActivityResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Processing Activity not found");
    }

    // If the activity is re-pointed at another data asset, that asset
    // must also belong to the caller's organization.
    if (input.dataAssetId !== undefined) {
      const asset = await this.dataAssetRepository.findById(
        ctx.organizationId,
        input.dataAssetId,
      );

      if (!asset) {
        throw new NotFoundError("Data Asset not found");
      }
    }

    return withTransaction(async (tx) => {
      const activity = await this.repository.update(
        tx,
        ctx,
        id,
        input,
      );

      // TODO(Developer A):
      // Add DOMAIN_EVENTS.ProcessingActivityUpdated to the shared
      // event catalog. Once available, publish the
      // ProcessingActivityUpdated outbox event here.

      return toProcessingActivityResponse(activity);
    });
  }

  async softDelete(
    ctx: RequestContext,
    id: string,
  ): Promise<ProcessingActivityResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Processing Activity not found");
    }

    return withTransaction(async (tx) => {
      const activity = await this.repository.softDelete(
        tx,
        ctx,
        id,
      );

      // TODO(Developer A):
      // Add DOMAIN_EVENTS.ProcessingActivityDeleted to the shared
      // event catalog. Once available, publish the
      // ProcessingActivityDeleted outbox event here.

      return toProcessingActivityResponse(activity);
    });
  }
}

export const processingActivityService = new ProcessingActivityService();
