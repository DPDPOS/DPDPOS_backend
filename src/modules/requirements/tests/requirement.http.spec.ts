import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Requirements HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";
  let otherOrgId = "";
  let frameworkId = "";
  let controlId = "";

  beforeAll(async () => {
    await prisma.$connect();

    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Requirements Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    const other = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Requirements Other Org ${Date.now()}` })
      .expect(201);
    otherOrgId = other.body.data.organization.id as string;
    createdOrgIds.push(otherOrgId);

    const framework = await request(app)
      .post("/api/v1/framework/generate")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.FRAMEWORK_GENERATE]),
      )
      .send({
        industryProfile: "retail",
        maturityLevel: "basic",
        dataSensitivity: "low",
        departmentCount: 1,
        processorCount: 0,
        isSdf: false,
      })
      .expect(201);
    frameworkId = framework.body.data.id as string;
    controlId = framework.body.data.controls[0].id as string;
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

  function authHeader(orgId: string, permissions: string[]) {
    return `Bearer ${signAccessToken({
      actorUserId: randomUUID(),
      organizationId: orgId,
      roles: ["ORG_ADMIN"],
      permissions,
    })}`;
  }

  it("lists generated requirements and filters by framework", async () => {
    const listed = await request(app)
      .get("/api/v1/requirements")
      .query({ frameworkId })
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_READ]),
      )
      .expect(200);

    expect(listed.body.data.length).toBeGreaterThan(0);
    expect(
      listed.body.data.every(
        (r: { frameworkId: string }) => r.frameworkId === frameworkId,
      ),
    ).toBe(true);
  });

  it("creates a requirement mapped to a control and writes outbox", async () => {
    const code = `REQ-CUSTOM-${Date.now()}`;
    const created = await request(app)
      .post("/api/v1/requirements")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({
        frameworkId,
        controlId,
        code,
        title: "Custom obligation",
        legalBasisRef: "DPDP Act 2023 s.8",
      })
      .expect(201);

    expect(created.body.data.code).toBe(code);
    expect(created.body.data.controlId).toBe(controlId);

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.RequirementMapped,
      },
    });
    expect(
      outbox.some(
        (row) =>
          (row.payload as { requirementId?: string }).requirementId ===
          created.body.data.id,
      ),
    ).toBe(true);

    const dup = await request(app)
      .post("/api/v1/requirements")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({
        frameworkId,
        code,
        title: "Duplicate",
      })
      .expect(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });

  it("maps an unmapped requirement and enforces tenant isolation", async () => {
    const created = await request(app)
      .post("/api/v1/requirements")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({
        frameworkId,
        code: `REQ-UNMAPPED-${Date.now()}`,
        title: "Unmapped obligation",
      })
      .expect(201);

    expect(created.body.data.controlId).toBeNull();

    const mapped = await request(app)
      .post(`/api/v1/requirements/${created.body.data.id}/map`)
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({ controlId })
      .expect(200);

    expect(mapped.body.data.controlId).toBe(controlId);

    await request(app)
      .post(`/api/v1/requirements/${created.body.data.id}/map`)
      .set(
        "Authorization",
        authHeader(otherOrgId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({ controlId })
      .expect(404);

    await request(app)
      .post("/api/v1/requirements")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.REQUIREMENT_CREATE]),
      )
      .send({
        frameworkId,
        controlId: randomUUID(),
        code: `REQ-BAD-CTRL-${Date.now()}`,
        title: "Bad control",
      })
      .expect(400);

    await request(app).get("/api/v1/requirements").expect(401);
    await request(app)
      .get("/api/v1/requirements")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.ORGANIZATION_READ]),
      )
      .expect(403);
  });
});
