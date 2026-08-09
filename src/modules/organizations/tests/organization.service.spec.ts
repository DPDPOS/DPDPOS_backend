import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { OrganizationService } from "../services/organization.service.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("OrganizationService", () => {
  const service = new OrganizationService();
  const createdIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdIds);
    await prisma.$disconnect();
  });

  it("creates an organization with system roles and an outbox event", async () => {
    const suffix = Date.now();
    const result = await service.create({
      name: `Day1 Org ${suffix}`,
      industry: "Healthcare",
      operatingRegion: "IN",
      maturityLevel: "Developing",
      isSignificantDataFiduciary: false,
    });

    createdIds.push(result.organization.id);

    expect(result.organization.name).toBe(`Day1 Org ${suffix}`);
    expect(result.systemRoles).toEqual(
      expect.arrayContaining([
        "ORG_ADMIN",
        "DPO",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
        "MEMBER",
      ]),
    );

    const roles = await prisma.role.findMany({
      where: { organizationId: result.organization.id, isSystemRole: true },
    });
    expect(roles).toHaveLength(5);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: result.organization.id,
        eventType: DOMAIN_EVENTS.OrganizationCreated,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("gets and updates an organization; soft-deleted rows are not readable", async () => {
    const created = await service.create({
      name: `Day1 Patch Org ${Date.now()}`,
      industry: "Fintech",
    });
    createdIds.push(created.organization.id);

    const fetched = await service.getById(created.organization.id);
    expect(fetched.industry).toBe("Fintech");

    const updated = await service.update(created.organization.id, {
      industry: "Insurance",
      maturityLevel: "Managed",
    });
    expect(updated.industry).toBe("Insurance");
    expect(updated.maturityLevel).toBe("Managed");

    await prisma.organization.update({
      where: { id: created.organization.id },
      data: { deletedAt: new Date() },
    });

    await expect(service.getById(created.organization.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
