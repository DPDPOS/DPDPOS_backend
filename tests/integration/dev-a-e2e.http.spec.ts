import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../src/events/types/base-event.interface.js";
import { PERMISSIONS } from "../../src/shared/constants/permissions.js";

/**
 * Cross-module happy path for Developer A:
 * org → roles → invite user → login → department → framework → controls → requirements
 */
describe("Dev A end-to-end integration", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `e2e.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let userId = "";
  let frameworkId = "";
  let controlId = "";
  let departmentId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.refreshSession.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.requirement.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.control.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.framework.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.department.deleteMany({
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
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await disconnectRedis();
    await prisma.$disconnect();
  });

  function bearer(token = accessToken) {
    return `Bearer ${token}`;
  }

  it("runs the full Developer A platform flow", async () => {
    // 1) Create organization (seeds system roles + OrganizationCreated)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `E2E Fiduciary ${Date.now()}`,
        industry: "fintech",
        maturityLevel: "Developing",
        isSignificantDataFiduciary: true,
      })
      .expect(201);

    organizationId = orgRes.body.data.organization.id as string;
    createdOrgIds.push(organizationId);
    expect(orgRes.body.data.systemRoles.length).toBeGreaterThanOrEqual(5);

    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    expect(adminRole).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "E2E Admin",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    userId = user.id;
    await prisma.userRole.create({
      data: {
        organizationId,
        userId,
        roleId: adminRole!.id,
      },
    });

    // 2) Login activates invited user and returns permissions
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(200);

    accessToken = login.body.data.tokens.accessToken as string;
    expect(login.body.data.user.status).toBe("ACTIVE");
    expect(login.body.data.user.permissions).toContain(PERMISSIONS.FRAMEWORK_GENERATE);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", bearer())
      .expect(200);
    expect(me.body.data.id).toBe(userId);
    expect(me.body.data.roles).toContain("ORG_ADMIN");

    // 3) Invite another user via API (UserInvited + RoleAssigned)
    const invited = await request(app)
      .post("/api/v1/users")
      .set("Authorization", bearer())
      .send({
        email: `e2e.member.${Date.now()}@example.com`,
        name: "E2E Member",
      })
      .expect(201);
    expect(invited.body.data.status).toBe("INVITED");
    expect(invited.body.data.passwordHash).toBeUndefined();

    // 4) Roles list + custom role
    const roleList = await request(app)
      .get("/api/v1/roles")
      .set("Authorization", bearer())
      .expect(200);
    expect(roleList.body.data.some((r: { name: string }) => r.name === "ORG_ADMIN")).toBe(
      true,
    );

    const customRole = await request(app)
      .post("/api/v1/roles")
      .set("Authorization", bearer())
      .send({
        name: `Custom ${Date.now()}`,
        permissions: [PERMISSIONS.CONTROL_READ, PERMISSIONS.REQUIREMENT_READ],
      })
      .expect(201);

    await request(app)
      .patch(`/api/v1/roles/${customRole.body.data.id}/permissions`)
      .set("Authorization", bearer())
      .send({
        permissions: [
          PERMISSIONS.CONTROL_READ,
          PERMISSIONS.REQUIREMENT_READ,
          PERMISSIONS.DEPARTMENT_READ,
        ],
      })
      .expect(200);

    // 5) Department
    const dept = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", bearer())
      .send({ name: `Compliance ${Date.now()}`, headUserId: userId })
      .expect(201);
    departmentId = dept.body.data.id as string;

    const depts = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", bearer())
      .expect(200);
    expect(depts.body.data.some((d: { id: string }) => d.id === departmentId)).toBe(true);

    // 6) Framework generate → controls + requirements + roadmap
    const framework = await request(app)
      .post("/api/v1/framework/generate")
      .set("Authorization", bearer())
      .send({
        industryProfile: "fintech",
        maturityLevel: "intermediate",
        dataSensitivity: "high",
        departmentCount: 2,
        processorCount: 1,
        isSdf: true,
      })
      .expect(201);

    frameworkId = framework.body.data.id as string;
    expect(framework.body.data.controls.length).toBeGreaterThan(0);
    expect(framework.body.data.requirements.length).toBeGreaterThan(0);
    controlId = framework.body.data.controls[0].id as string;

    const roadmap = await request(app)
      .get("/api/v1/framework/roadmap")
      .set("Authorization", bearer())
      .expect(200);
    expect(roadmap.body.data.id).toBe(frameworkId);

    await request(app)
      .post("/api/v1/framework/publish")
      .set("Authorization", bearer())
      .send({ frameworkId })
      .expect(200);

    // 7) Controls list + update (ControlUpdated)
    const controls = await request(app)
      .get("/api/v1/controls")
      .query({ frameworkId })
      .set("Authorization", bearer())
      .expect(200);
    expect(controls.body.data.length).toBeGreaterThan(0);

    const patched = await request(app)
      .patch(`/api/v1/controls/${controlId}`)
      .set("Authorization", bearer())
      .send({ status: "IN_PROGRESS", ownerUserId: userId })
      .expect(200);
    expect(patched.body.data.status).toBe("IN_PROGRESS");
    expect(patched.body.data.ownerUserId).toBe(userId);

    // 8) Requirements list + create + map
    const requirements = await request(app)
      .get("/api/v1/requirements")
      .query({ frameworkId })
      .set("Authorization", bearer())
      .expect(200);
    expect(requirements.body.data.length).toBeGreaterThan(0);

    const unmapped = await request(app)
      .post("/api/v1/requirements")
      .set("Authorization", bearer())
      .send({
        frameworkId,
        code: `REQ-E2E-${Date.now()}`,
        title: "E2E unmapped obligation",
      })
      .expect(201);
    expect(unmapped.body.data.controlId).toBeNull();

    const mapped = await request(app)
      .post(`/api/v1/requirements/${unmapped.body.data.id}/map`)
      .set("Authorization", bearer())
      .send({ controlId })
      .expect(200);
    expect(mapped.body.data.controlId).toBe(controlId);

    // 9) Org read with same tenant token
    await request(app)
      .get(`/api/v1/organizations/${organizationId}`)
      .set("Authorization", bearer())
      .expect(200);

    // 10) Outbox contains the key domain events from this flow
    const outbox = await prisma.outboxEvent.findMany({
      where: { organizationId },
      select: { eventType: true },
    });
    const types = new Set(outbox.map((e) => e.eventType));
    expect(types.has(DOMAIN_EVENTS.OrganizationCreated)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.UserLoggedIn)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.UserInvited)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.DepartmentCreated)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.FrameworkPublished)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.ControlUpdated)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.RequirementMapped)).toBe(true);
    expect(types.has(DOMAIN_EVENTS.RolePermissionsChanged)).toBe(true);
  });

  it("seeded demo admin can login and hit a protected route", async () => {
    const seedOrgId = "00000000-0000-4000-8000-000000000001";
    const seedUser = await prisma.user.findFirst({
      where: {
        organizationId: seedOrgId,
        email: "admin@demo.dpdpos.local",
        deletedAt: null,
      },
    });

    // Demo seed is applied in CI after migrate; skip locally if not seeded.
    if (!seedUser?.passwordHash) {
      return;
    }

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({
        organizationId: seedOrgId,
        email: "admin@demo.dpdpos.local",
        password: "ChangeMe123!",
      })
      .expect(200);

    const token = login.body.data.tokens.accessToken as string;
    await request(app)
      .get("/api/v1/departments")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });
});
