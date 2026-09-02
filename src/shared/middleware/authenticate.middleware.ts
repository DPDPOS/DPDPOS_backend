import type { NextFunction, Response } from "express";
import { UnauthorizedError } from "../errors/app-error.js";
import { getCorrelationId } from "../middleware/correlation-id.middleware.js";
import type { RequestContext } from "../types/request-context.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import {
  extractBearerToken,
  verifyAccessToken,
} from "../../modules/auth/utils/jwt.js";
import { isAccessTokenDenied } from "../../modules/auth/utils/token-denylist.js";
import {
  getCachedPermissions,
  setCachedPermissions,
} from "../../infrastructure/cache/permission-cache.js";
import { AuthRepository } from "../../modules/auth/repositories/auth.repository.js";
import { appConfig } from "../../config/app.config.js";

const authRepo = new AuthRepository();

/**
 * Verifies Bearer access JWT and attaches RequestContext to the request.
 * Permissions are refreshed from Redis cache (or DB on miss) so role changes
 * take effect without waiting for JWT expiry.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const claims = verifyAccessToken(token);
    if (await isAccessTokenDenied(claims.jti)) {
      throw new UnauthorizedError("Access token has been revoked");
    }

    let permissions = claims.permissions;
    let roles = claims.roles;

    const cached = await getCachedPermissions(
      claims.organizationId,
      claims.sub,
    );
    if (cached) {
      permissions = cached.permissions;
      roles = cached.roles;
    } else {
      const user = await authRepo.findUserById({
        organizationId: claims.organizationId,
        userId: claims.sub,
      });
      if (user && user.status !== "DISABLED") {
        permissions = user.permissions;
        roles = user.roleNames;
        await setCachedPermissions(
          claims.organizationId,
          claims.sub,
          { permissions, roles },
          appConfig.jwt.accessTtlSeconds,
        );
      }
    }

    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp =
      typeof forwarded === "string"
        ? forwarded.split(",")[0]?.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]
          : undefined;

    const context: RequestContext = {
      correlationId:
        req.correlationId ?? getCorrelationId() ?? claims.jti ?? claims.sub,
      organizationId: claims.organizationId,
      actorUserId: claims.sub,
      permissions,
      roles,
      ipAddress: forwardedIp || req.ip || undefined,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : undefined,
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
