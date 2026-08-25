import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  CreateRoleDto,
  ListRolesQuery,
  UpdateRolePermissionsDto,
} from "../dto/role.dto.js";
import { roleService } from "../services/role.service.js";

export class RoleController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListRolesQuery;
      const result = await roleService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateRoleDto;
      const role = await roleService.create(ctx, body);
      sendSuccess(res, role, 201);
    } catch (err) {
      next(err);
    }
  }

  async updatePermissions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as UpdateRolePermissionsDto;
      const role = await roleService.updatePermissions(ctx, id, body);
      sendSuccess(res, role);
    } catch (err) {
      next(err);
    }
  }

  async syncSystemPresets(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const result = await roleService.syncSystemPresets(ctx);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const roleController = new RoleController();
