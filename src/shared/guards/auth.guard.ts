import type { NextFunction, Response } from "express";
import { UnauthorizedError } from "../errors/app-error.js";
import type { RequestContext } from "../types/request-context.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import { authenticate } from "../middleware/authenticate.middleware.js";

export type { AuthenticatedRequest };

/**
 * Ensures the request was authenticated and RequestContext is present.
 * Prefer chaining: authenticate → requirePermission → handler.
 * authGuard alone also runs JWT verification for convenience.
 */
export function authGuard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.context?.actorUserId && req.context.organizationId) {
    next();
    return;
  }
  authenticate(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.context?.actorUserId || !req.context.organizationId) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }
    next();
  });
}

export function getRequestContext(req: AuthenticatedRequest): RequestContext {
  if (!req.context) {
    throw new UnauthorizedError("Missing request context");
  }
  return req.context;
}
