import type { RequestContext } from "../../../shared/types/request-context.js";
import { AnalyticsRepository } from "../repositories/analytics.repository.js";
import type { 
  DashboardOverview, 
  ComplianceScoreResult, 
  ViolationBreakdown, 
  EvidenceCoverage, 
  RightsRequestMetrics, 
  ConsentMetrics,
  RoadmapProgress,
} from "../dto/analytics-response.dto.js";

export class AnalyticsService {
  private repo = new AnalyticsRepository();

  async getComplianceScore(ctx: RequestContext): Promise<ComplianceScoreResult> {
    const [stats, evidence] = await Promise.all([
      this.repo.getLatestValidationStats(ctx.organizationId),
      this.repo.getEvidenceCoverage(ctx.organizationId),
    ]);

    let validationScore = 0;
    if (stats.totalRules > 0) {
      validationScore = Math.round((stats.passed / stats.totalRules) * 100);
    }

    let evidenceScore = 0;
    if (evidence.totalControls > 0) {
      evidenceScore = Math.round(
        (evidence.controlsWithEvidence / evidence.totalControls) * 100,
      );
    }

    // Blend: validation remains primary (70%), evidence coverage contributes 30%.
    // When either side has no data, fall back to the other.
    let score = validationScore;
    if (stats.totalRules > 0 && evidence.totalControls > 0) {
      score = Math.round(validationScore * 0.7 + evidenceScore * 0.3);
    } else if (stats.totalRules === 0 && evidence.totalControls > 0) {
      score = evidenceScore;
    }

    return {
      score,
      totalRules: stats.totalRules,
      passed: stats.passed,
      failed: stats.failed,
    };
  }

  async getValidationSummary(ctx: RequestContext) {
    return this.repo.getLatestValidationStats(ctx.organizationId);
  }

  async getViolationBreakdown(ctx: RequestContext): Promise<ViolationBreakdown> {
    return this.repo.getViolationBreakdown(ctx.organizationId);
  }

  async getEvidenceCoverage(ctx: RequestContext): Promise<EvidenceCoverage> {
    const { totalControls, controlsWithEvidence } = await this.repo.getEvidenceCoverage(ctx.organizationId);
    let coveragePercent = 0;
    if (totalControls > 0) {
      coveragePercent = Math.round((controlsWithEvidence / totalControls) * 100);
    }

    return {
      totalControls,
      controlsWithEvidence,
      coveragePercent,
    };
  }

  async getRightsRequestMetrics(ctx: RequestContext): Promise<RightsRequestMetrics> {
    return this.repo.getRightsRequestMetrics(ctx.organizationId);
  }

  async getConsentMetrics(ctx: RequestContext): Promise<ConsentMetrics> {
    return this.repo.getConsentMetrics(ctx.organizationId);
  }

  async getDashboardOverview(ctx: RequestContext): Promise<DashboardOverview> {
    const [
      complianceScore,
      violations,
      evidence,
      rightsRequests,
      consent,
      roadmapProgress,
    ] = await Promise.all([
      this.getComplianceScore(ctx),
      this.getViolationBreakdown(ctx),
      this.getEvidenceCoverage(ctx),
      this.getRightsRequestMetrics(ctx),
      this.getConsentMetrics(ctx),
      this.getRoadmapProgress(ctx),
    ]);

    return {
      complianceScore,
      violations,
      evidence,
      roadmapProgress,
      rightsRequests,
      consent,
    };
  }

  async getRoadmapProgress(ctx: RequestContext): Promise<RoadmapProgress> {
    const { roadmapService } = await import(
      "../../framework/services/roadmap.service.js"
    );
    try {
      const live = await roadmapService.buildLiveRoadmap(ctx.organizationId);
      return {
        overallProgressPercent: live.summary.overallProgressPercent,
        overdueCount: live.summary.overdueCount,
        openViolationCount: live.summary.openViolationCount,
        byPhase: Object.fromEntries(
          Object.entries(live.summary.byPhase).map(([phase, stats]) => [
            phase,
            { total: stats.total, progressPercent: stats.progressPercent },
          ]),
        ),
      };
    } catch {
      return {
        overallProgressPercent: 0,
        overdueCount: 0,
        openViolationCount: 0,
        byPhase: {},
      };
    }
  }

  async getVendorRisk(ctx: RequestContext) {
    const { vendorService } = await import(
      "../../vendors/services/vendor.service.js"
    );
    return vendorService.analyticsSummary(ctx);
  }
}

export const analyticsService = new AnalyticsService();
