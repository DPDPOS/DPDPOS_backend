import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import { evidenceService } from "../services/evidence.service.js";
import type { CreateEvidenceDto, ConfirmUploadDto, TagEvidenceDto, MapEvidenceDto, ListEvidenceQuery, ExportEvidenceDto } from "../dto/evidence.dto.js";

export class EvidenceController {
  async initiateUpload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateEvidenceDto;
      const data = await evidenceService.initiateUpload(ctx, body);
      sendSuccess(res, data, 201);
    } catch (err) { next(err); }
  }

  async confirmUpload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const body = req.body as ConfirmUploadDto;
      const data = await evidenceService.confirmUpload(ctx, id, body);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListEvidenceQuery;
      const data = await evidenceService.list(ctx, query);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await evidenceService.getById(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getDownloadUrl(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await evidenceService.getDownloadUrl(ctx, id);
      sendSuccess(res, { downloadUrl: data });
    } catch (err) { next(err); }
  }

  async tagEvidence(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const body = req.body as TagEvidenceDto;
      const data = await evidenceService.tagEvidence(ctx, id, body);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async mapToControl(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const body = req.body as MapEvidenceDto;
      const data = await evidenceService.mapToControl(ctx, id, body);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async submitForReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await evidenceService.submitForReview(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await evidenceService.approve(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async lock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await evidenceService.lock(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async exportPack(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await evidenceService.exportEvidencePack(
        ctx,
        (req as ValidatedRequest).validatedBody as ExportEvidenceDto,
      );
      sendSuccess(res, data, 202);
    } catch (err) { next(err); }
  }
}
export const evidenceController = new EvidenceController();
