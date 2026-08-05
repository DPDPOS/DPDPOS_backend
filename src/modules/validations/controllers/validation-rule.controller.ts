import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type {
  CreateValidationRuleDto,
  ListValidationRulesQuery,
  UpdateValidationRuleDto,
} from "../dto/validation-rule.dto.js";

import { validationRuleService } from "../services/validation-rule.service.js";

export class ValidationRuleController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateValidationRuleDto;

      const rule = await validationRuleService.create(ctx, body);

      sendSuccess(res, rule, 201);
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
        {}) as ListValidationRulesQuery;

      const rules = await validationRuleService.list(ctx, query);

      sendSuccess(res, rules);
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

      const rule = await validationRuleService.getById(ctx, id);

      sendSuccess(res, rule);
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
      const body = req.body as UpdateValidationRuleDto;

      const rule = await validationRuleService.update(ctx, id, body);

      sendSuccess(res, rule);
    } catch (err) {
      next(err);
    }
  }
}

export const validationRuleController = new ValidationRuleController();
