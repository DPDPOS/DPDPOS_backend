import type { NextFunction, Response } from "express";
import { ForbiddenError } from "../errors/app-error.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";

/**
 * PermissionGuard — checks resource:action permission strings against the caller's set.
 */
export function requirePermission(...required: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const permissions = req.context?.permissions ?? [];
    const missing = required.filter((p) => !permissions.includes(p));
    if (missing.length > 0) {
      next(
        new ForbiddenError(
          `Missing required permission(s): ${missing.join(", ")}`,
        ),
      );
      return;
    }
    next();
  };
}
