import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DataAssetService } from "../services/data-asset.service.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

describe("DataAssetService department validation", () => {
  const service = new DataAssetService();
  const orgIds: string[] = [];
  let organizationId = "";
  let ctx: RequestContext;

  beforeAll(async () => {
    await prisma.$connect();
    const org = await prisma.organization.create({
      data: { name: `Dept Valid Org ${Date.now()}` },
    });
    organizationId = org.id;
    orgIds.push(org.id);
    ctx = {
      organizationId,
      actorUserId: randomUUID(),
      correlationId: randomUUID(),
      permissions: [],
      roles: [],
    };
  });

  afterAll(async () => {
    await deleteTestOrganizations(orgIds);
    await prisma.$disconnect();
  });

  it("rejects departmentId from another organisation", async () => {
    const other = await prisma.organization.create({
      data: { name: `Other Org ${Date.now()}` },
    });
    orgIds.push(other.id);
    const foreignDept = await prisma.department.create({
      data: { organizationId: other.id, name: "Foreign Legal" },
    });

    await expect(
      service.create(ctx, {
        assetName: "Bad dept asset",
        assetType: "Database",
        category: "HR",
        sensitivity: "HIGH",
        departmentId: foreignDept.id,
      }),
    ).rejects.toThrow(/departmentId/i);
  });

  it("accepts departmentId from the same organisation", async () => {
    const dept = await prisma.department.create({
      data: { organizationId, name: "Local HR" },
    });

    const asset = await service.create(ctx, {
      assetName: "Good dept asset",
      assetType: "Database",
      category: "HR",
      sensitivity: "MEDIUM",
      departmentId: dept.id,
    });
    expect(asset.departmentId).toBe(dept.id);
  });
});
