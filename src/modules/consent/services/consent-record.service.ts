import { NotFoundError, ConflictError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataAssetRepository } from "../../inventory/repositories/data-asset.repository.js";
import { NoticeRepository } from "../repositories/notice.repository.js";
import {
  ConsentRecordRepository,
  type ListConsentRecordsOptions,
} from "../repositories/consent-record.repository.js";
import type { CreateConsentRecordDto } from "../dto/consent-record.dto.js";

import {
  toConsentRecordResponse,
  type ConsentRecordResponse,
} from "../types/consent-record.types.js";

export class ConsentRecordService {
  constructor(
    private readonly repository = new ConsentRecordRepository(),
    private readonly noticeRepository = new NoticeRepository(),
    private readonly dataAssetRepository = new DataAssetRepository(),
  ) {}

  async create(
    ctx: RequestContext,
    input: CreateConsentRecordDto,
  ): Promise<ConsentRecordResponse> {
    // Business rule: any referenced notice or data asset must belong to the
    // caller's organization.
    if (input.noticeId) {
      const notice = await this.noticeRepository.findById(
        ctx.organizationId,
        input.noticeId,
      );

      if (!notice) {
        throw new NotFoundError("Notice not found");
      }
    }

    if (input.dataAssetId) {
      const asset = await this.dataAssetRepository.findById(
        ctx.organizationId,
        input.dataAssetId,
      );

      if (!asset) {
        throw new NotFoundError("Data Asset not found");
      }
    }

    return withTransaction(async (tx) => {
      const record = await this.repository.create(tx, ctx, {
        dataSubjectIdentifier: input.dataSubjectIdentifier,
        noticeId: input.noticeId,
        dataAssetId: input.dataAssetId,
        purpose: input.purpose,
        grantedAt: input.grantedAt
          ? new Date(input.grantedAt)
          : undefined,
        proofFileId: input.proofFileId,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ConsentRecorded,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          consentRecordId: record.id,
          purpose: record.purpose,
        },
      });

      return toConsentRecordResponse(record);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<ConsentRecordResponse> {
    const record = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!record) {
      throw new NotFoundError("Consent Record not found");
    }

    return toConsentRecordResponse(record);
  }

  async list(
    ctx: RequestContext,
    options: ListConsentRecordsOptions = {},
  ): Promise<ConsentRecordResponse[]> {
    const records = await this.repository.list(
      ctx.organizationId,
      options,
    );

    return records.map(toConsentRecordResponse);
  }

  async withdraw(
    ctx: RequestContext,
    id: string,
  ): Promise<ConsentRecordResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Consent Record not found");
    }

    if (existing.consentState === "WITHDRAWN") {
      throw new ConflictError("Consent has already been withdrawn");
    }

    return withTransaction(async (tx) => {
      const record = await this.repository.withdraw(
        tx,
        ctx,
        id,
      );

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ConsentWithdrawn,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          consentRecordId: record.id,
          withdrawnAt: record.withdrawnAt?.toISOString(),
        },
      });

      return toConsentRecordResponse(record);
    });
  }
}

export const consentRecordService = new ConsentRecordService();
