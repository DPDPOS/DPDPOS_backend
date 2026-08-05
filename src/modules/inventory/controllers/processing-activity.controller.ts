import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type {
  CreateProcessingActivityDto,
  UpdateProcessingActivityDto,
} from "../dto/processing-activity.dto.js";

import { processingActivityService } from "../services/processing-activity.service.js";

export class ProcessingActivityController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateProcessingActivityDto;

      const activity = await processingActivityService.create(ctx, body);

      sendSuccess(res, activity, 201);
    } catch (err) {
      next(err);
    }
  }

  async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ??
        {}) as { dataAssetId?: string };

      const activities = await processingActivityService.list(ctx, query);

      sendSuccess(res, activities);
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const activity = await processingActivityService.getById(ctx, id);

      sendSuccess(res, activity);
    } catch (err) {
      next(err);
    }
  }

  async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const body = req.body as UpdateProcessingActivityDto;

      const activity = await processingActivityService.update(
        ctx,
        id,
        body,
      );

      sendSuccess(res, activity);
    } catch (err) {
      next(err);
    }
  }

  async softDelete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const activity = await processingActivityService.softDelete(
        ctx,
        id,
      );

      sendSuccess(res, activity);
    } catch (err) {
      next(err);
    }
  }
}

export const processingActivityController =
  new ProcessingActivityController();
