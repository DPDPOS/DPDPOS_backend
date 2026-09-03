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
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const requests = await prisma.dataSubjectRequest.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        status: true,
        requestType: true,
        createdAt: true,
        openedAt: true,
        closedAt: true,
        dueAt: true,
      },
    });

    let total = 0;
    let open = 0;
    let closed = 0;
    let overdueCount = 0;
    let openedThisMonth = 0;
    let totalDays = 0;
    const byType: Record<string, number> = {};
    const terminal = new Set(["CLOSED", "REJECTED", "RESPONDED"]);

    for (const r of requests) {
      total++;
      byType[r.requestType] = (byType[r.requestType] || 0) + 1;
      if (r.openedAt >= monthStart) openedThisMonth++;

      if (terminal.has(r.status)) {
        closed++;
        if (r.closedAt) {
          const days =
            (r.closedAt.getTime() - r.createdAt.getTime()) /
            (1000 * 60 * 60 * 24);
          totalDays += days;
        }
      } else {
        open++;
        if (r.dueAt && r.dueAt < now) overdueCount++;
      }
    }

    const avgResolutionDays =
      closed > 0 && totalDays > 0 ? totalDays / closed : null;

    return {
      total,
      open,
      closed,
      overdueCount,
      openedThisMonth,
      avgResolutionDays,
      byType,
    };
  }

  async getConsentMetrics(
    organizationId: string,
    options: { from?: Date; to?: Date } = {},
  ) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const records = await prisma.consentRecord.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.from || options.to
          ? {
              grantedAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      select: {
        consentState: true,
        grantedAt: true,
        withdrawnAt: true,
        expiresAt: true,
      },
    });

    let totalRecords = 0;
    let granted = 0;
    let withdrawn = 0;
    let grantedThisMonth = 0;
    let withdrawnThisMonth = 0;
    let expired = 0;
    let expiringSoon = 0;

    for (const r of records) {
      totalRecords++;
      if (r.consentState === "GRANTED") {
        granted++;
        if (r.grantedAt >= monthStart) grantedThisMonth++;
      } else if (r.consentState === "WITHDRAWN") {
        withdrawn++;
        if (r.withdrawnAt && r.withdrawnAt >= monthStart) withdrawnThisMonth++;
      }
      if (r.expiresAt && r.expiresAt < now && r.consentState === "GRANTED") {
        expired++;
      } else if (
        r.expiresAt &&
        r.expiresAt >= now &&
        r.expiresAt <= soon &&
        r.consentState === "GRANTED"
      ) {
        expiringSoon++;
      }
    }

    return {
      totalRecords,
      granted,
      withdrawn,
      grantedThisMonth,
      withdrawnThisMonth,
      expired,
      expiringSoon,
    };
  }
}
