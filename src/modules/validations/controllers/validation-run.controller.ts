import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type {
  CreateValidationRunDto,
  ListValidationRunsQuery,
} from "../dto/validation-run.dto.js";

import { validationRunService } from "../services/validation-run.service.js";

export class ValidationRunController {
  async trigger(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateValidationRunDto;

      const run = await validationRunService.trigger(ctx, body);

      sendSuccess(res, run, 201);
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
        {}) as ListValidationRunsQuery;

      const runs = await validationRunService.list(ctx, query);

      sendSuccess(res, runs);
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

      const run = await validationRunService.getById(ctx, id);

      sendSuccess(res, run);
    } catch (err) {
      next(err);
    }
  }
}

export const validationRunController = new ValidationRunController();
