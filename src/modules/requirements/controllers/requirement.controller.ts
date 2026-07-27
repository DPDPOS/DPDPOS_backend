import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  CreateRequirementDto,
  ListRequirementsQuery,
  MapRequirementDto,
} from "../dto/requirement.dto.js";
import { requirementService } from "../services/requirement.service.js";

export class RequirementController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ??
        {}) as ListRequirementsQuery;
      const result = await requirementService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateRequirementDto;
      const requirement = await requirementService.create(ctx, body);
      sendSuccess(res, requirement, 201);
    } catch (err) {
      next(err);
    }
  }

  async map(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as MapRequirementDto;
      const requirement = await requirementService.mapToControl(ctx, id, body);
      sendSuccess(res, requirement);
    } catch (err) {
      next(err);
    }
  }
}

export const requirementController = new RequirementController();
