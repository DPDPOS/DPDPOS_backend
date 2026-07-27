import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";

describe("Controls HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";
  let otherOrgId = "";
  let frameworkId = "";
  let ownerUserId = "";

  beforeAll(async () => {
    await prisma.$connect();

    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Controls Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    const other = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Controls Other Org ${Date.now()}` })
      .expect(201);
    otherOrgId = other.body.data.organization.id as string;
    createdOrgIds.push(otherOrgId);

    const user = await request(app)
      .post("/api/v1/users")
      .set("Authorization", authHeader(organizationId, [PERMISSIONS.USER_CREATE]))
      .send({
        email: `control.owner.${Date.now()}@example.com`,
        name: "Control Owner",
      })
      .expect(201);
    ownerUserId = user.body.data.id as string;

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
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
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

  it("lists generated controls and filters by framework", async () => {
    const listed = await request(app)
      .get("/api/v1/controls")
      .query({ frameworkId })
      .set("Authorization", authHeader(organizationId, [PERMISSIONS.CONTROL_READ]))
      .expect(200);

    expect(listed.body.data.length).toBeGreaterThan(0);
    expect(
      listed.body.data.every(
        (c: { frameworkId: string }) => c.frameworkId === frameworkId,
      ),
    ).toBe(true);
  });

  it("creates and updates a control with owner and outbox", async () => {
    const code = `CTRL-CUSTOM-${Date.now()}`;
    const created = await request(app)
      .post("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_CREATE]),
      )
      .send({
        frameworkId,
        code,
        title: "Custom retention check",
        description: "Manual control",
        ownerUserId,
        legalBasisRef: "DPDP Act 2023 s.8",
      })
      .expect(201);

    expect(created.body.data.code).toBe(code);
    expect(created.body.data.ownerUserId).toBe(ownerUserId);
    expect(created.body.data.status).toBe("NOT_STARTED");

    const updated = await request(app)
      .patch(`/api/v1/controls/${created.body.data.id}`)
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_UPDATE]),
      )
      .send({ status: "IN_PROGRESS" })
      .expect(200);

    expect(updated.body.data.status).toBe("IN_PROGRESS");

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ControlUpdated,
      },
    });
    expect(
      outbox.some(
        (row) =>
          (row.payload as { controlId?: string }).controlId ===
          created.body.data.id,
      ),
    ).toBe(true);

    const dup = await request(app)
      .post("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_CREATE]),
      )
      .send({
        frameworkId,
        code,
        title: "Duplicate",
      })
      .expect(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });

  it("enforces tenant isolation and validation", async () => {
    const created = await request(app)
      .post("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_CREATE]),
      )
      .send({
        frameworkId,
        code: `CTRL-ISO-${Date.now()}`,
        title: "Isolation target",
      })
      .expect(201);

    await request(app)
      .patch(`/api/v1/controls/${created.body.data.id}`)
      .set("Authorization", authHeader(otherOrgId, [PERMISSIONS.CONTROL_UPDATE]))
      .send({ status: "IMPLEMENTED" })
      .expect(404);

    await request(app)
      .post("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_CREATE]),
      )
      .send({
        frameworkId: randomUUID(),
        code: `CTRL-BAD-FW-${Date.now()}`,
        title: "Bad framework",
      })
      .expect(400);

    await request(app)
      .post("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.CONTROL_CREATE]),
      )
      .send({
        frameworkId,
        code: `CTRL-BAD-OWNER-${Date.now()}`,
        title: "Bad owner",
        ownerUserId: randomUUID(),
      })
      .expect(400);

    await request(app).get("/api/v1/controls").expect(401);
    await request(app)
      .get("/api/v1/controls")
      .set(
        "Authorization",
        authHeader(organizationId, [PERMISSIONS.ORGANIZATION_READ]),
      )
      .expect(403);
  });
});
