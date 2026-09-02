import type { NextFunction, Response } from "express";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import type { LedgerExportQuery } from "../dto/ledger.dto.js";
import { evidenceLedgerService } from "../services/evidence-ledger.service.js";

export class LedgerController {
  async verify(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await evidenceLedgerService.verifyIntegrity(ctx.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async export(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as LedgerExportQuery;
      sendSuccess(
        res,
        await evidenceLedgerService.exportEntries(ctx.organizationId, query),
      );
    } catch (error) {
      next(error);
    }
  }
}

export const ledgerController = new LedgerController();
