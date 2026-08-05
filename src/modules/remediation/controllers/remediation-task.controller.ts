import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type { CreateRemediationTaskDto } from "../dto/create-remediation-task.dto.js";
import type { UpdateRemediationTaskDto } from "../dto/update-remediation-task.dto.js";
import type {
  CloseRemediationTaskBody,
  ListRemediationTasksQuery,
} from "../dto/remediation-task.dto.js";

import { remediationTaskService } from "../services/remediation-task.service.js";

export class RemediationTaskController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateRemediationTaskDto;

      const task = await remediationTaskService.create(ctx, body);

      sendSuccess(res, task, 201);
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
        {}) as ListRemediationTasksQuery;

      const tasks = await remediationTaskService.list(ctx, query);

      sendSuccess(res, tasks);
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

      const task = await remediationTaskService.getById(ctx, id);

      sendSuccess(res, task);
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
      const body = req.body as UpdateRemediationTaskDto;

      const task = await remediationTaskService.update(ctx, id, body);

      sendSuccess(res, task);
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
      const body = req.body as CloseRemediationTaskBody;

      const task = await remediationTaskService.close(ctx, id, body);

      sendSuccess(res, task);
    } catch (err) {
      next(err);
    }
  }
}

export const remediationTaskController = new RemediationTaskController();
