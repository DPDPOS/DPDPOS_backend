import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type {
  CreateUserDto,
  ListUsersQuery,
  UpdateUserDto,
} from "../dto/user.dto.js";
import { userService } from "../services/user.service.js";

export class UserController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListUsersQuery;
      const result = await userService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }

  async invite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateUserDto;
      const user = await userService.invite(ctx, body);
      sendSuccess(res, user, 201);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as UpdateUserDto;
      const user = await userService.update(ctx, id, body);
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
