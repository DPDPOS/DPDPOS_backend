import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type { CreateViolationDto } from "../dto/create-violation.dto.js";
import type { UpdateViolationDto } from "../dto/update-violation.dto.js";
import type { CloseViolationBody, ListViolationsQuery } from "../dto/violation.dto.js";

import { violationService } from "../services/violation.service.js";

export class ViolationController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateViolationDto;

      const violation = await violationService.create(ctx, body);

      sendSuccess(res, violation, 201);
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
        {}) as ListViolationsQuery;

      const violations = await violationService.list(ctx, query);

      sendSuccess(res, violations);
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

      const violation = await violationService.getById(ctx, id);

      sendSuccess(res, violation);
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
      const body = req.body as UpdateViolationDto;

      const violation = await violationService.update(ctx, id, body);

      sendSuccess(res, violation);
    } catch (err) {
      next(err);
    }
  }

  async close(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };
      const body = req.body as CloseViolationBody;

      const violation = await violationService.close(ctx, id, body);

      sendSuccess(res, violation);
    } catch (err) {
      next(err);
    }
  }
}

export const violationController = new ViolationController();
