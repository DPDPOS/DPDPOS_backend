import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  GenerateFrameworkDto,
  PublishFrameworkDto,
  RoadmapQuery,
} from "../dto/framework.dto.js";
import { frameworkService } from "../services/framework.service.js";

export class FrameworkController {
  async generate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as GenerateFrameworkDto;
      const framework = await frameworkService.generate(ctx, body);
      sendSuccess(res, framework, 201);
    } catch (err) {
      next(err);
    }
  }

  async roadmap(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as RoadmapQuery;
      const framework = await frameworkService.getRoadmap(ctx, query.frameworkId);
      sendSuccess(res, framework);
    } catch (err) {
      next(err);
    }
  }

  async publish(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = (req.body ?? {}) as PublishFrameworkDto;
      const framework = await frameworkService.publish(ctx, body);
      sendSuccess(res, framework);
    } catch (err) {
      next(err);
    }
  }
}

export const frameworkController = new FrameworkController();
