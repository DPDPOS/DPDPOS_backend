import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import { reportService } from "../services/report.service.js";
import type { GenerateReportDto, ListReportsQuery } from "../dto/report.dto.js";

export class ReportController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListReportsQuery;
      const result = await reportService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as GenerateReportDto;
      const data = await reportService.generate(ctx, body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await reportService.getById(ctx, id);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async getDownloadUrl(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await reportService.getDownloadUrl(ctx, id);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      sendSuccess(res, await reportService.cancel(ctx, id));
    } catch (err) { next(err); }
  }
}

export const reportController = new ReportController();
