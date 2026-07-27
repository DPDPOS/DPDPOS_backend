import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  CreateDepartmentDto,
  ListDepartmentsQuery,
} from "../dto/department.dto.js";
import { departmentService } from "../services/department.service.js";

export class DepartmentController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListDepartmentsQuery;
      const result = await departmentService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateDepartmentDto;
      const department = await departmentService.create(ctx, body);
      sendSuccess(res, department, 201);
    } catch (err) {
      next(err);
    }
  }
}

export const departmentController = new DepartmentController();
