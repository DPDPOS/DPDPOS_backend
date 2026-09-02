import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import { EvidenceRepository } from "../repositories/evidence.repository.js";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "../../../infrastructure/storage/s3-adapter.js";
import { s3Config } from "../../../config/s3.config.js";
import { assertTransition } from "../domain/evidence-lifecycle.js";
import crypto from "crypto";
import type { CreateEvidenceDto, ConfirmUploadDto, TagEvidenceDto, MapEvidenceDto, ListEvidenceQuery } from "../dto/evidence.dto.js";
import type { ExportEvidenceDto } from "../dto/evidence.dto.js";

export class EvidenceService {
  private repo = new EvidenceRepository();

  async initiateUpload(ctx: RequestContext, dto: CreateEvidenceDto) {
    const s3Client = await getS3Client();
    const id = crypto.randomUUID();
    const storageKey = `evidence/${ctx.organizationId}/${id}/${dto.fileName}`;
    // Default retention: 1 year from upload unless a caller sets expiresAt later.
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    return withTransaction(async (tx) => {
      const evidence = await this.repo.create(tx, ctx, {
        id,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        description: dto.description,
        controlId: dto.controlId,
        violationId: dto.violationId,
        tags: dto.tags || [],
        storageKey,
        status: "UPLOADED",
        uploadedBy: ctx.actorUserId,
        expiresAt,
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.EvidenceUploaded,
        organizationId: ctx.organizationId,
        payload: { id: evidence.id, storageKey },
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
      });

      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: storageKey,
        ContentType: dto.mimeType,
      });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return { evidence, uploadUrl };
    });
  }

  async confirmUpload(ctx: RequestContext, id: string, dto: ConfirmUploadDto) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");

    return withTransaction(async (tx) => {
      return this.repo.update(tx, ctx, id, {
        fileHash: dto.fileHash,
        fileSizeBytes: dto.fileSizeBytes,
      });
    });
  }

  async tagEvidence(ctx: RequestContext, id: string, dto: TagEvidenceDto) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    assertTransition(existing.status, "TAGGED");

    return withTransaction(async (tx) => {
      return this.repo.update(tx, ctx, id, {
        tags: dto.tags,
        ...(dto.description && { description: dto.description }),
        status: "TAGGED"
      });
    });
  }

  async mapToControl(ctx: RequestContext, id: string, dto: MapEvidenceDto) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    assertTransition(existing.status, "MAPPED");

    return withTransaction(async (tx) => {
      return this.repo.update(tx, ctx, id, {
        controlId: dto.controlId,
        status: "MAPPED"
      });
    });
  }

  async submitForReview(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    assertTransition(existing.status, "UNDER_REVIEW");

    return withTransaction(async (tx) => {
      return this.repo.update(tx, ctx, id, {
        status: "UNDER_REVIEW"
      });
    });
  }

  async approve(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    assertTransition(existing.status, "APPROVED");

    return withTransaction(async (tx) => {
      const updated = await this.repo.update(tx, ctx, id, {
        status: "APPROVED",
        reviewedBy: ctx.actorUserId,
        approvedBy: ctx.actorUserId
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.EvidenceApproved,
        organizationId: ctx.organizationId,
        payload: {
          id: updated.id,
          controlId: updated.controlId,
          uploadedBy: updated.uploadedBy,
          fileName: updated.fileName,
        },
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
      });

      // Advance the linked control immediately (event handler remains as
      // idempotent backup for roadmap sync / other subscribers).
      if (updated.controlId) {
        const control = await tx.control.findFirst({
          where: {
            id: updated.controlId,
            organizationId: ctx.organizationId,
            deletedAt: null,
            status: "NOT_STARTED",
          },
        });
        if (control) {
          await tx.control.update({
            where: { id: control.id },
            data: {
              status: "IN_PROGRESS",
              updatedBy: ctx.actorUserId,
            },
          });
          await writeOutboxEvent(tx, {
            eventType: DOMAIN_EVENTS.ControlUpdated,
            organizationId: ctx.organizationId,
            actorUserId: ctx.actorUserId,
            correlationId: ctx.correlationId,
            payload: {
              controlId: control.id,
              status: "IN_PROGRESS",
              code: control.code,
            },
          });
        }
      }

      return updated;
    });
  }

  async lock(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    assertTransition(existing.status, "LOCKED");

    return withTransaction(async (tx) => {
      const updated = await this.repo.update(tx, ctx, id, {
        status: "LOCKED",
        lockedAt: new Date(),
      });

      // Locked approved evidence is immutable proof — advance the linked
      // control to IMPLEMENTED when it is still in progress / not started.
      if (updated.controlId) {
        const control = await tx.control.findFirst({
          where: {
            id: updated.controlId,
            organizationId: ctx.organizationId,
            deletedAt: null,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          },
        });
        if (control) {
          await tx.control.update({
            where: { id: control.id },
            data: {
              status: "IMPLEMENTED",
              updatedBy: ctx.actorUserId,
            },
          });
          await writeOutboxEvent(tx, {
            eventType: DOMAIN_EVENTS.ControlUpdated,
            organizationId: ctx.organizationId,
            actorUserId: ctx.actorUserId,
            correlationId: ctx.correlationId,
            payload: {
              controlId: control.id,
              status: "IMPLEMENTED",
              code: control.code,
              reason: "evidence_locked",
              evidenceId: updated.id,
            },
          });
        }
      }

      return updated;
    });
  }

  async getById(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");
    const downloadUrl = await this.getDownloadUrl(ctx, id);
    // Flat record + optional downloadUrl — matches list items and the UI drawer.
    return {
      ...existing,
      tags: existing.tags ?? [],
      downloadUrl,
    };
  }

  async list(ctx: RequestContext, query: ListEvidenceQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await Promise.all([
      this.repo.list(ctx.organizationId, { ...query, page, pageSize }),
      this.repo.countByOrg(ctx.organizationId, query),
    ]);
    return {
      items,
      meta: {
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    };
  }

  async getDownloadUrl(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(ctx.organizationId, id);
    if (!existing) throw new NotFoundError("Evidence not found");

    const s3Client = await getS3Client();
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: existing.storageKey,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  async exportEvidencePack(ctx: RequestContext, filters: ExportEvidenceDto) {
    // Route through the report pipeline so status/download live in Reports
    // (the dedicated export-queue had no worker).
    const { reportService } = await import(
      "../../reports/services/report.service.js"
    );
    const report = await reportService.generate(ctx, {
      reportType: "EVIDENCE_REPORT",
      title: "Evidence export pack",
      format: "CSV",
      parameters: {
        status: filters.status,
        controlId: filters.controlId,
        violationId: filters.violationId,
      },
    });
    return {
      jobId: report.id,
      reportId: report.id,
      status: "PENDING" as const,
    };
  }
}
export const evidenceService = new EvidenceService();
