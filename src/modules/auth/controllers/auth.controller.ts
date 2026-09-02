import type { NextFunction, Response } from "express";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import { extractBearerToken } from "../utils/jwt.js";
import type {
  AcceptInviteDto,
  LoginDto,
  LogoutDto,
  LookupOrganizationsDto,
  MfaConfirmDto,
  MfaResendDto,
  MfaVerifyDto,
  RefreshDto,
  SignupDto,
} from "../dto/auth.dto.js";
import { authService } from "../services/auth.service.js";

export class AuthController {
  async signup(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as SignupDto;
      const result = await authService.signup(body, {
        userAgent: req.header("user-agent") ?? undefined,
        ipAddress: req.ip,
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async lookupOrganizations(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const body = req.body as LookupOrganizationsDto;
      const result = await authService.lookupOrganizations(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

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

  async verifyMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as MfaVerifyDto;
      const result = await authService.verifyMfa(body, {
        userAgent: req.header("user-agent") ?? undefined,
        ipAddress: req.ip,
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async resendMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.resendMfa(req.body as MfaResendDto, { ipAddress: req.ip });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async acceptInvite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const body = req.body as AcceptInviteDto;
      const result = await authService.acceptInvite(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async setupMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const result = await authService.setupMfa(ctx);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async confirmMfa(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as MfaConfirmDto;
      const result = await authService.confirmMfa(ctx, body);
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
