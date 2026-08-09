import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Framework HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Framework Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    createdOrgIds.push(organizationId);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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
    await prisma.$disconnect();
  });

  function authHeader(permissions: string[]) {
    return `Bearer ${signAccessToken({
      actorUserId: randomUUID(),
      organizationId,
      roles: ["ORG_ADMIN"],
      permissions,
    })}`;
  }

  it("generates a draft framework with expected controls and roadmap", async () => {
    const generated = await request(app)
      .post("/api/v1/framework/generate")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.FRAMEWORK_GENERATE]),
      )
      .send({
        industryProfile: "fintech",
        maturityLevel: "intermediate",
        dataSensitivity: "high",
        departmentCount: 3,
        processorCount: 2,
        isSdf: true,
      })
      .expect(201);

    expect(generated.body.data.status).toBe("DRAFT");
    expect(generated.body.data.isSdf).toBe(true);
    expect(generated.body.data.controls.length).toBeGreaterThanOrEqual(10);
    expect(
      generated.body.data.controls.some(
        (c: { code: string }) => c.code === "CTRL-SDF-DPO",
      ),
    ).toBe(true);
    expect(
      generated.body.data.controls.some(
        (c: { code: string }) => c.code === "CTRL-PROCESSOR",
      ),
    ).toBe(true);
    expect(generated.body.data.requirements.length).toBeGreaterThan(0);
    expect(generated.body.data.roadmapJson.summary.controlCount).toBe(
      generated.body.data.controls.length,
    );

    const roadmap = await request(app)
      .get("/api/v1/framework/roadmap")
      .set("Authorization", authHeader([PERMISSIONS.FRAMEWORK_READ]))
      .expect(200);

    expect(roadmap.body.data.id).toBe(generated.body.data.id);
    expect(roadmap.body.data.roadmapJson.phases.length).toBeGreaterThan(0);
  });

  it("publishes framework and writes outbox event", async () => {
    const published = await request(app)
      .post("/api/v1/framework/publish")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.FRAMEWORK_PUBLISH]),
      )
      .send({})
      .expect(200);

    expect(published.body.data.status).toBe("PUBLISHED");
    expect(published.body.data.publishedAt).toBeTruthy();

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.FrameworkPublished,
      },
    });
    expect(
      outbox.some(
        (row) =>
          (row.payload as { frameworkId?: string }).frameworkId ===
          published.body.data.id,
      ),
    ).toBe(true);
  });

  it("regenerates a new draft while keeping published framework", async () => {
    const again = await request(app)
      .post("/api/v1/framework/generate")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.FRAMEWORK_GENERATE]),
      )
      .send({
        industryProfile: "retail",
        maturityLevel: "basic",
        dataSensitivity: "low",
        departmentCount: 1,
        processorCount: 0,
        isSdf: false,
        publish: true,
      })
      .expect(201);

    expect(again.body.data.status).toBe("PUBLISHED");
    expect(
      again.body.data.controls.some(
        (c: { code: string }) => c.code === "CTRL-SDF-DPO",
      ),
    ).toBe(false);

    const frameworks = await prisma.framework.findMany({
      where: { organizationId, deletedAt: null },
    });
    expect(frameworks.some((f) => f.status === "ARCHIVED")).toBe(true);
    expect(frameworks.filter((f) => f.status === "PUBLISHED")).toHaveLength(1);
  });

  it("returns 401/403 for protected routes", async () => {
    await request(app).get("/api/v1/framework/roadmap").expect(401);
    await request(app)
      .get("/api/v1/framework/roadmap")
      .set("Authorization", authHeader([PERMISSIONS.ORGANIZATION_READ]))
      .expect(403);
  });
});
