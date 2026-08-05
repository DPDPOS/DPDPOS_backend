import type { RequestContext } from "../../../shared/types/request-context.js";
import { AnalyticsRepository } from "../repositories/analytics.repository.js";
import type { 
  DashboardOverview, 
  ComplianceScoreResult, 
  ViolationBreakdown, 
  EvidenceCoverage, 
  RightsRequestMetrics, 
  ConsentMetrics 
} from "../dto/analytics-response.dto.js";

export class AnalyticsService {
  private repo = new AnalyticsRepository();

  async getComplianceScore(ctx: RequestContext): Promise<ComplianceScoreResult> {
    const stats = await this.repo.getLatestValidationStats(ctx.organizationId);
    let score = 0;
    if (stats.totalRules > 0) {
      score = Math.round((stats.passed / stats.totalRules) * 100);
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
      consent
    ] = await Promise.all([
      this.getComplianceScore(ctx),
      this.getViolationBreakdown(ctx),
      this.getEvidenceCoverage(ctx),
      this.getRightsRequestMetrics(ctx),
      this.getConsentMetrics(ctx)
    ]);

    return {
      complianceScore,
      violations,
      evidence,
      rightsRequests,
      consent
    };
  }
}

export const analyticsService = new AnalyticsService();
