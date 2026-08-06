import { prisma } from "../../../infrastructure/database/prisma-client.js";

export class AnalyticsRepository {
  async getLatestValidationStats(organizationId: string) {
    const latestRun = await prisma.validationRun.findFirst({
      where: { organizationId, status: "COMPLETED", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!latestRun) {
      return { totalRules: 0, passed: 0, failed: 0 };
    }

    const passed = await prisma.validationResult.count({
      where: { runId: latestRun.id, resultStatus: "PASS", deletedAt: null },
    });
    
    const failed = await prisma.validationResult.count({
      where: { runId: latestRun.id, resultStatus: "FAIL", deletedAt: null },
    });

    return { totalRules: passed + failed, passed, failed };
  }

  async getViolationBreakdown(organizationId: string) {
    const violations = await prisma.violation.findMany({
      where: { organizationId, deletedAt: null },
      select: { status: true, severity: true },
    });

    let total = 0;
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const v of violations) {
      total++;
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    }

    return { total, byStatus, bySeverity };
  }

  async getEvidenceCoverage(organizationId: string) {
    const totalControls = await prisma.control.count({
      where: { organizationId, deletedAt: null },
    });

    const evidenceFiles = await prisma.evidenceFile.findMany({
      where: { 
        organizationId, 
        deletedAt: null,
        status: { in: ["APPROVED", "LOCKED"] }
      },
      select: { controlId: true },
      distinct: ["controlId"],
    });
    
    const controlsWithEvidence = evidenceFiles.filter(e => e.controlId != null).length;

    return { totalControls, controlsWithEvidence };
  }

  async getRightsRequestMetrics(organizationId: string) {
    // Note: DSR closedAt field used here (prisma schema dependent), 
    // fallbacks used if closedAt isn't standard
    const requests = await prisma.dataSubjectRequest.findMany({
      where: { organizationId, deletedAt: null },
      select: { status: true, requestType: true, createdAt: true, closedAt: true },
    });

    let total = 0;
    let open = 0;
    let closed = 0;
    let totalDays = 0;
    const byType: Record<string, number> = {};

    for (const r of requests) {
      total++;
      byType[r.requestType] = (byType[r.requestType] || 0) + 1;

      if (r.status === "RESPONDED") {
        closed++;
        if (r.closedAt) {
          const days = (r.closedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          totalDays += days;
        } else {
            // fallback if closedAt doesn't exist but status is closed
            const days = (new Date().getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            totalDays += days;
        }
      } else {
        open++;
      }
    }

    const avgResolutionDays = closed > 0 && totalDays > 0 ? totalDays / closed : null;

    return { total, open, closed, avgResolutionDays, byType };
  }

  async getConsentMetrics(organizationId: string) {
    const records = await prisma.consentRecord.findMany({
      where: { organizationId, deletedAt: null },
      select: { consentState: true },
    });

    let totalRecords = 0;
    let granted = 0;
    let withdrawn = 0;

    for (const r of records) {
      totalRecords++;
      if (r.consentState === "GRANTED") {
        granted++;
      } else if (r.consentState === "WITHDRAWN") {
        withdrawn++;
      }
    }

    return { totalRecords, granted, withdrawn };
  }
}
