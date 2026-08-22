import { prisma } from "../infrastructure/database/prisma-client.js";

/**
 * FK-safe teardown for integration/service tests that create temporary orgs.
 * Idempotent: safe to call after partial manual cleanup.
 *
 * Validation/outbox workers can rewrite child rows while teardown runs, so
 * the final org delete is retried with a full child wipe each attempt.
 */
export async function deleteTestOrganizations(
  organizationIds: string[],
): Promise<void> {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (ids.length === 0) return;

  const orgWhere = { organizationId: { in: ids } };

  async function wipeChildren(): Promise<void> {
    // Assessment spine
    await prisma.assessmentAuditEvent.deleteMany({ where: orgWhere });
    await prisma.assessmentReport.deleteMany({ where: orgWhere });
    await prisma.assessmentControlResult.deleteMany({ where: orgWhere });
    await prisma.cliFinding.deleteMany({ where: orgWhere });
    await prisma.scanJob.deleteMany({ where: orgWhere });
    await prisma.cliToken.deleteMany({ where: orgWhere });
    await prisma.questionnaireAnswer.deleteMany({ where: orgWhere });
    await prisma.assessmentDocument.deleteMany({ where: orgWhere });
    await prisma.assessmentVersion.deleteMany({ where: orgWhere });
    await prisma.assessment.deleteMany({ where: orgWhere });

    // Enforcement / ops
    await prisma.remediationTask.deleteMany({ where: orgWhere });
    await prisma.evidenceFile.deleteMany({ where: orgWhere });
    await prisma.violation.deleteMany({ where: orgWhere });

    // Validation (results first; workers may recreate mid-teardown)
    const runs = await prisma.validationRun.findMany({
      where: orgWhere,
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    await prisma.validationResult.deleteMany({
      where: {
        OR: [
          orgWhere,
          ...(runIds.length > 0 ? [{ runId: { in: runIds } }] : []),
        ],
      },
    });
    await prisma.validationRun.deleteMany({ where: orgWhere });
    await prisma.validationRule.deleteMany({ where: orgWhere });

    // Rights / consent / inventory / vendors (TPRM)
    await prisma.erasureChecklistItem.deleteMany({ where: orgWhere });
    await prisma.dataSubjectRequest.deleteMany({ where: orgWhere });
    await prisma.consentRecord.deleteMany({ where: orgWhere });
    await prisma.notice.deleteMany({ where: orgWhere });
    await prisma.processingActivity.deleteMany({ where: orgWhere });
    await prisma.vendorRelationship.deleteMany({ where: orgWhere });
    await prisma.vendorAgreement.deleteMany({ where: orgWhere });
    await prisma.vendorDiligenceReview.deleteMany({ where: orgWhere });
    await prisma.vendor.deleteMany({ where: orgWhere });
    await prisma.dataAsset.deleteMany({ where: orgWhere });

    // Programme
    await prisma.requirement.deleteMany({ where: orgWhere });
    await prisma.control.deleteMany({ where: orgWhere });
    await prisma.framework.deleteMany({ where: orgWhere });

    // Proof / platform
    await prisma.report.deleteMany({ where: orgWhere });
    await prisma.notification.deleteMany({ where: orgWhere });
    await prisma.aiUsageLog.deleteMany({ where: orgWhere });
    await prisma.outboxEvent.deleteMany({ where: orgWhere });
    await prisma.refreshSession.deleteMany({ where: orgWhere });

    // Identity (SSO / AD / Entra) — created on login via getOrCreate
    await prisma.identityGroupRoleMap.deleteMany({ where: orgWhere });
    await prisma.identitySyncRun.deleteMany({ where: orgWhere });
    await prisma.identityProvider.deleteMany({ where: orgWhere });
    await prisma.organizationIdentitySettings.deleteMany({ where: orgWhere });

    // IAM
    await prisma.userRole.deleteMany({ where: orgWhere });
    await prisma.department.deleteMany({ where: orgWhere });
    await prisma.role.deleteMany({ where: orgWhere });
    await prisma.user.deleteMany({ where: orgWhere });

    await prisma.auditLog.deleteMany({ where: orgWhere });
    await prisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE organization_id = ANY($1::uuid[])`,
      ids,
    );
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await wipeChildren();
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 75 * (attempt + 1)));
    }
  }
  throw lastError;
}
