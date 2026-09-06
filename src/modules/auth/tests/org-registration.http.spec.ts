import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import { getLastActivationUrlForTest } from "../../../infrastructure/email/ses-email.provider.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Organization Self-Service Registration and Verification", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const testAdminEmail = `admin-${Date.now()}@testfiduciary.org`;
  let activationToken = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.control.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.requirement.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.framework.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.department.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.refreshSession.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.userRole.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await deleteTestOrganizations(createdOrgIds);
    }
    await disconnectRedis();
  });

  it("registers a new organization, admin account, roles, and baseline framework", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register-org")
      .send({
        organizationName: "Acro Fiduciary Systems",
        industry: "fintech",
        companySize: "51-250",
        operatingRegion: "India",
        companyType: "Private Limited",
        isSignificantDataFiduciary: true,
        adminName: "Acro Administrator",
        adminEmail: testAdminEmail,
        password: "SuperSecretPassword123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organizationId).toBeDefined();
    expect(res.body.data.email).toBe(testAdminEmail);

    const orgId = res.body.data.organizationId;
    createdOrgIds.push(orgId);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        roles: true,
        departments: true,
        frameworks: {
          include: {
            controls: true,
            requirements: true,
          },
        },
      },
    });

    expect(org).not.toBeNull();
    expect(org!.name).toBe("Acro Fiduciary Systems");
    expect(org!.isSignificantDataFiduciary).toBe(true);
    expect(org!.roles.length).toBeGreaterThan(0);
    expect(org!.departments.length).toBe(1);
    expect(org!.frameworks.length).toBe(1);
    expect(org!.frameworks[0].controls.length).toBeGreaterThan(0);

    const user = await prisma.user.findFirst({
      where: { organizationId: orgId, email: testAdminEmail },
    });
    expect(user).not.toBeNull();
    expect(user!.status).toBe("INVITED");
    expect(user!.inviteTokenHash).toBeDefined();

    const activationUrl = getLastActivationUrlForTest(testAdminEmail);
    expect(activationUrl).toBeDefined();
    const urlObj = new URL(activationUrl!);
    activationToken = urlObj.searchParams.get("token")!;
    expect(activationToken).toBeTruthy();
  });

  it("rejects registration when email already belongs to an active account", async () => {
    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-org")
      .send({ token: activationToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.tokens.accessToken).toBeDefined();
    expect(verifyRes.body.data.user.status).toBe("ACTIVE");

    const duplicateRes = await request(app)
      .post("/api/v1/auth/register-org")
      .send({
        organizationName: "Another Org",
        industry: "healthcare",
        companySize: "1-50",
        operatingRegion: "India",
        adminName: "Duplicate Admin",
        adminEmail: testAdminEmail,
        password: "SuperSecretPassword123!",
      });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe("CONFLICT");
  });

  it("rejects activation with invalid token", async () => {
    const badRes = await request(app)
      .post("/api/v1/auth/verify-org")
      .send({ token: "invalid-token-123" });

    expect(badRes.status).toBe(400);
  });
});
