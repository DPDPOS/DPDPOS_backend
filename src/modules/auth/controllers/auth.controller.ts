import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import { extractBearerToken } from "../utils/jwt.js";
import type { LoginDto, LogoutDto, RefreshDto } from "../dto/auth.dto.js";
import { authService } from "../services/auth.service.js";

export class AuthController {
  async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as LoginDto;
      const result = await authService.login(body, {
        userAgent: req.header("user-agent") ?? undefined,
        ipAddress: req.ip,
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as RefreshDto;
      const tokens = await authService.refresh(body, {
        userAgent: req.header("user-agent") ?? undefined,
        ipAddress: req.ip,
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, tokens);
    } catch (err) {
      next(err);
    }
  }

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as LogoutDto;
      const accessToken =
        extractBearerToken(req.header("authorization") ?? undefined) ?? undefined;
      const result = await authService.logout(body, accessToken);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const me = await authService.me(ctx);
      sendSuccess(res, me);
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
