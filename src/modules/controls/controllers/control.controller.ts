import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  CreateControlDto,
  ListControlsQuery,
  UpdateControlDto,
} from "../dto/control.dto.js";
import { controlService } from "../services/control.service.js";

export class ControlController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListControlsQuery;
      const result = await controlService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateControlDto;
      const control = await controlService.create(ctx, body);
      sendSuccess(res, control, 201);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as UpdateControlDto;
      const control = await controlService.update(ctx, id, body);
      sendSuccess(res, control);
    } catch (err) {
      next(err);
    }
  }
}

export const controlController = new ControlController();
