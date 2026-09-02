import { prisma } from "../infrastructure/database/prisma-client.js";

/**
 * Marks an org as having finished once-per-tenant DPDP onboarding.
 * Use in integration tests that create assessments without running the wizard.
 * Does not invent an industry (that would pull sector questionnaire packs).
 */
export async function markOrganizationOnboarded(
  organizationId: string,
  completedBy?: string,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      onboardingCompletedAt: new Date(),
      ...(completedBy ? { onboardingCompletedBy: completedBy } : {}),
    },
  });
}
