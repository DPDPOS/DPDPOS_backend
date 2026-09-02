import type { ValidationDataProvider } from "../interfaces/validation-data-provider.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

import { DataAssetRepository } from "../../inventory/repositories/data-asset.repository.js";
import { ProcessingActivityRepository } from "../../inventory/repositories/processing-activity.repository.js";
import { NoticeRepository } from "../../consent/repositories/notice.repository.js";
import { ConsentRecordRepository } from "../../consent/repositories/consent-record.repository.js";
import { DataSubjectRequestRepository } from "../../rights/repositories/data-subject-request.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

/**
 * Loads the discovery snapshot for one organization by reading Dev B's own
 * modules (inventory / consent / rights / vendors) through their repositories.
 */
export class PrismaValidationDataProvider implements ValidationDataProvider {
  constructor(
    private readonly dataAssets = new DataAssetRepository(),
    private readonly processingActivities = new ProcessingActivityRepository(),
    private readonly notices = new NoticeRepository(),
    private readonly consentRecords = new ConsentRecordRepository(),
    private readonly dataSubjectRequests = new DataSubjectRequestRepository(),
  ) {}

  async loadSnapshot(organizationId: string): Promise<RuleEvaluationInput> {
    const [
      assets,
      activities,
      notices,
      consents,
      requests,
      vendors,
      org,
      framework,
      dpoUser,
      openErasure,
      openFindings,
      agents,
      latestCatalogRevision,
    ] = await Promise.all([
      this.dataAssets.list(organizationId),
      this.processingActivities.list(organizationId),
      this.notices.list(organizationId),
      this.consentRecords.list(organizationId),
      this.dataSubjectRequests.list(organizationId),
      prisma.vendor.findMany({
        where: { organizationId, deletedAt: null },
        include: {
          agreements: {
            where: {
              status: "ACTIVE",
              deletedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            take: 1,
          },
          reviews: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { isSignificantDataFiduciary: true },
      }),
      prisma.framework.findFirst({
        where: { organizationId, status: "PUBLISHED", deletedAt: null },
        orderBy: { publishedAt: "desc" },
        select: { id: true, isSdf: true, roadmapJson: true },
      }),
      prisma.user.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          status: { not: "DISABLED" },
          userRoles: {
            some: { role: { name: { in: ["DPO", "DATA_PROTECTION_OFFICER"] } } },
          },
        },
        select: { id: true },
      }),
      prisma.dataSubjectRequest.count({
        where: {
          organizationId,
          deletedAt: null,
          requestType: "ERASURE",
          status: { notIn: ["CLOSED", "REJECTED"] },
        },
      }),
      prisma.complianceFinding.findMany({
        where: {
          organizationId,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        select: {
          id: true,
          ruleCode: true,
          severity: true,
          status: true,
          systemId: true,
          dataAssetId: true,
          lastSeenAt: true,
        },
      }),
      prisma.agent.findMany({
        where: { organizationId },
        select: { id: true, state: true, lastHeartbeatAt: true },
      }),
      prisma.catalogRevision.findFirst({
        where: { organizationId },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
    ]);

    const frameworkId = framework?.id ?? null;
    const [controls, evidenceCounts] = await Promise.all([
      prisma.control.findMany({
        where: {
          organizationId,
          deletedAt: null,
          ...(frameworkId ? { frameworkId } : {}),
        },
        select: { id: true, code: true, status: true },
      }),
      prisma.evidenceFile.groupBy({
        by: ["controlId"],
        where: {
          organizationId,
          deletedAt: null,
          controlId: { not: null },
          status: { in: ["APPROVED", "LOCKED"] },
        },
        _count: true,
      }),
    ]);

    const evidenceByControl = new Map(
      evidenceCounts
        .filter((e) => e.controlId)
        .map((e) => [e.controlId as string, e._count]),
    );

    const profile = (
      framework?.roadmapJson as { profile?: Record<string, unknown> } | null
    )?.profile;
    const processesChildrenData = Boolean(profile?.processesChildrenData ?? false);

    return {
      organizationId,
      organization: {
        isSignificantDataFiduciary:
          org?.isSignificantDataFiduciary || framework?.isSdf || false,
        processesChildrenData,
        hasDpoUser: Boolean(dpoUser),
        frameworkId,
      },
      controls: controls.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        approvedEvidenceCount: evidenceByControl.get(c.id) ?? 0,
      })),
      dataAssets: assets,
      processingActivities: activities,
      notices,
      consentRecords: consents,
      dataSubjectRequests: requests,
      openErasureRequests: openErasure,
      openFindings,
      agents,
      catalogRevisionAgeHours: latestCatalogRevision
        ? Math.max(
            0,
            (Date.now() - latestCatalogRevision.receivedAt.getTime()) /
              (60 * 60 * 1000),
          )
        : null,
      vendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        status: v.status,
        criticality: v.criticality,
        hasActiveDpa: v.agreements.length > 0,
        latestReviewOutcome: v.reviews[0]?.outcome ?? null,
        crossBorderAllowed: v.agreements.some((a) => a.crossBorderAllowed),
      })),
    };
  }
}
