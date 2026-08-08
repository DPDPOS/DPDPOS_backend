import type { NextFunction, Response } from "express";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../../shared/errors/app-error.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import { extractBearerToken } from "../../auth/utils/jwt.js";
import { hashToken } from "../../auth/utils/token-crypto.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";

export type CliAuthContext = {
  correlationId: string;
  organizationId: string;
  assessmentId: string;
  cliTokenId: string;
  actorType: "CLI";
};

export type CliAuthenticatedRequest = AuthenticatedRequest & {
  cliContext?: CliAuthContext;
};

export async function authenticateCli(
  req: CliAuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = extractBearerToken(req.header("authorization") ?? undefined);
    if (!raw || !raw.startsWith("dpdp_")) {
      throw new UnauthorizedError("CLI token required");
    }

    const tokenHash = hashToken(raw);
    const row = await prisma.cliToken.findUnique({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedError("Invalid or revoked CLI token");
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("CLI token expired");
    }

    const assessmentId = req.params.id;
    if (assessmentId && assessmentId !== row.assessmentId) {
      throw new ForbiddenError("CLI token is not valid for this assessment");
    }

    await prisma.cliToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    req.cliContext = {
      correlationId: req.correlationId ?? getCorrelationId() ?? row.id,
      organizationId: row.organizationId,
      assessmentId: row.assessmentId,
      cliTokenId: row.id,
      actorType: "CLI",
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function getCliContext(req: CliAuthenticatedRequest): CliAuthContext {
  if (!req.cliContext) {
    throw new UnauthorizedError("CLI authentication required");
  }
  return req.cliContext;
}
