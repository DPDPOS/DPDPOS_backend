import type { NextFunction, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../errors/app-error.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import { isPrivilegedRoleSet } from "../../modules/auth/utils/mfa.js";

/**
 * Require a recent MFA assertion on the access token for privileged roles.
 * Non-privileged callers pass through.
 */
export function requireMfa(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    if (!req.context) {
      throw new UnauthorizedError("Authentication required");
    }
    if (isPrivilegedRoleSet(req.context.roles) && !req.context.mfaVerified) {
      throw new ForbiddenError(
        "MFA verification required for privileged roles",
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
