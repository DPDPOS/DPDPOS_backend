import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../errors/app-error.js";
import type { RequestContext } from "../types/request-context.js";

export type AuthenticatedRequest = Request & {
  context?: RequestContext;
  correlationId?: string;
};

/**
 * Auth guard contract — verifies JWT and attaches RequestContext.
 * Full JWT verification lands in feature/a/auth; this stub rejects unauthenticated calls
 * once auth is wired. During early scaffolding, routes that need auth should use this guard.
 */
export function authGuard(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.context?.actorUserId || !req.context.organizationId) {
    next(new UnauthorizedError("Authentication required"));
    return;
  }
  next();
}

export function getRequestContext(req: AuthenticatedRequest): RequestContext {
  if (!req.context) {
    throw new UnauthorizedError("Missing request context");
  }
  return req.context;
}
