import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { analyticsController } from "../controllers/analytics.controller.js";
import { analyticsPermissions } from "../permissions/analytics.permissions.js";

export function createAnalyticsRouter(): Router {
  const router = Router();
  
  router.get("/dashboard", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getDashboardOverview(req, res, next));
    
  router.get("/compliance-score", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getComplianceScore(req, res, next));
    
  router.get("/violations", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getViolationBreakdown(req, res, next));
    
  router.get("/evidence", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getEvidenceCoverage(req, res, next));
    
  router.get("/rights-requests", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getRightsRequestMetrics(req, res, next));
    
  router.get("/consent", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getConsentMetrics(req, res, next));

  router.get("/validations", authenticate, requirePermission(analyticsPermissions.read),
    (req, res, next) => void analyticsController.getValidationSummary(req, res, next));
    
  return router;
}
