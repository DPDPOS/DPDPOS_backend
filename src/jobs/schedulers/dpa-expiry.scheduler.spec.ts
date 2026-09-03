import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { deleteTestOrganizations } from "../../test-utils/cleanup-organizations.js";
import { scanExpiringDpas } from "../schedulers/dpa-expiry.scheduler.js";
import { DOMAIN_EVENTS } from "../../events/types/base-event.interface.js";

describe("scanExpiringDpas", () => {
  const orgIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await deleteTestOrganizations(orgIds);
    await prisma.$disconnect();
  });

  it("emits DpaExpiring once per agreement per day", async () => {
    const org = await prisma.organization.create({
      data: { name: `DPA Expiry Org ${Date.now()}` },
    });
    orgIds.push(org.id);

    const vendor = await prisma.vendor.create({
      data: {
        organizationId: org.id,
        name: "Cloud Vendor",
        vendorType: "PROCESSOR",
        status: "ACTIVE",
        criticality: "HIGH",
      },
    });

    const expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const agreement = await prisma.vendorAgreement.create({
      data: {
        organizationId: org.id,
        vendorId: vendor.id,
        title: "DPA",
        versionLabel: "v1",
        status: "ACTIVE",
        expiresAt,
      },
    });

    const first = await scanExpiringDpas();
    expect(first.emitted).toBeGreaterThanOrEqual(1);

    const events = await prisma.outboxEvent.findMany({
      where: {
        organizationId: org.id,
        eventType: DOMAIN_EVENTS.DpaExpiring,
        correlationId: {
          startsWith: `dpa-expiry:${agreement.id}:`,
        },
      },
    });
    expect(events.length).toBe(1);

    const second = await scanExpiringDpas();
    expect(second.emitted).toBe(0);
  });
});
