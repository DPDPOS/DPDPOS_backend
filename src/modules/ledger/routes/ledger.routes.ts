import { Router } from "express";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { ledgerController } from "../controllers/ledger.controller.js";
import { ledgerExportQuerySchema } from "../dto/ledger.dto.js";

export function createLedgerRouter(): Router {
  const router = Router();
  router.get(
    "/verify",
    authenticate,
    requirePermission(PERMISSIONS.LEDGER_VERIFY),
    (req, res, next) => void ledgerController.verify(req, res, next),
  );
  router.get(
    "/export",
    authenticate,
    requirePermission(PERMISSIONS.LEDGER_READ),
    validateQuery(ledgerExportQuerySchema),
    (req, res, next) => void ledgerController.export(req, res, next),
  );
  return router;
}
