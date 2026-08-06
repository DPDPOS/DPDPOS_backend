import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { aiService } from "../services/ai.service.js";
import type { AiDraftDto, AiExplainDto, AiSummarizeDto } from "../dto/ai.dto.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

export class AiController {
  async explain(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await aiService.explain(ctx, (req as ValidatedRequest).validatedBody as AiExplainDto);
      sendSuccess(res, data, 201);
    } catch (err) { next(err); }
  }

  async summarize(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await aiService.summarize(ctx, (req as ValidatedRequest).validatedBody as AiSummarizeDto);
      sendSuccess(res, data, 201);
    } catch (err) { next(err); }
  }

  async draft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await aiService.draft(ctx, (req as ValidatedRequest).validatedBody as AiDraftDto);
      sendSuccess(res, data, 201);
    } catch (err) { next(err); }
  }

  async getResult(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await aiService.getResult(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getUsageStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await aiService.getUsageStats(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }
}

export const aiController = new AiController();
