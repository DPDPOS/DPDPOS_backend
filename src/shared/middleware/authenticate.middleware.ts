import type { NextFunction, Response } from "express";
import { UnauthorizedError } from "../errors/app-error.js";
import { getCorrelationId } from "../middleware/correlation-id.middleware.js";
import type { RequestContext } from "../types/request-context.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import {
  extractBearerToken,
  verifyAccessToken,
} from "../../modules/auth/utils/jwt.js";

/**
 * Verifies Bearer access JWT and attaches RequestContext to the request.
 * Use before requirePermission(...) on protected routes.
 */
export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const claims = verifyAccessToken(token);
    const context: RequestContext = {
      correlationId:
        req.correlationId ?? getCorrelationId() ?? claims.jti ?? claims.sub,
      organizationId: claims.organizationId,
      actorUserId: claims.sub,
      permissions: claims.permissions,
      roles: claims.roles,
      ...(claims.mfaVerified !== undefined
        ? { mfaVerified: claims.mfaVerified }
        : {}),
    };

    req.context = context;
    next();
  } catch (err) {
    next(err);
  }
}
