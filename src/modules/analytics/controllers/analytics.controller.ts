import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { analyticsService } from "../services/analytics.service.js";

export class AnalyticsController {
  async getDashboardOverview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await analyticsService.getDashboardOverview(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getComplianceScore(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await analyticsService.getComplianceScore(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getViolationBreakdown(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await analyticsService.getViolationBreakdown(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getEvidenceCoverage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await analyticsService.getEvidenceCoverage(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getRightsRequestMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await analyticsService.getRightsRequestMetrics(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getConsentMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
      const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
      const from = fromRaw ? new Date(fromRaw) : undefined;
      const to = toRaw ? new Date(toRaw) : undefined;
      const data = await analyticsService.getConsentMetrics(ctx, {
        ...(from && !Number.isNaN(from.getTime()) ? { from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { to } : {}),
      });
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getValidationSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await analyticsService.getValidationSummary(ctx));
    } catch (err) { next(err); }
  }

  async getVendorRisk(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await analyticsService.getVendorRisk(ctx));
    } catch (err) { next(err); }
  }
}

export const analyticsController = new AnalyticsController();
