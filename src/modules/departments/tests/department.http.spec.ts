import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

describe("Departments HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";
  let headUserId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Depts HTTP Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    const user = await request(app)
      .post("/api/v1/users")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.USER_CREATE]),
      )
      .send({
        email: `dept.head.${Date.now()}@example.com`,
        name: "HTTP Head",
      })
      .expect(201);
    headUserId = user.body.data.id as string;
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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

  it("creates and lists departments", async () => {
    const name = `Legal ${Date.now()}`;
    const created = await request(app)
      .post("/api/v1/departments")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.DEPARTMENT_CREATE]),
      )
      .send({ name, headUserId })
      .expect(201);

    expect(created.body.data.name).toBe(name);
    expect(created.body.data.headUserId).toBe(headUserId);

    const listed = await request(app)
      .get("/api/v1/departments")
      .set("Authorization", authHeader([PERMISSIONS.DEPARTMENT_READ]))
      .expect(200);

    expect(listed.body.data.some((d: { id: string }) => d.id === created.body.data.id)).toBe(
      true,
    );
  });

  it("returns 401/403 and rejects bad head user", async () => {
    await request(app).get("/api/v1/departments").expect(401);
    await request(app)
      .get("/api/v1/departments")
      .set("Authorization", authHeader([PERMISSIONS.ORGANIZATION_READ]))
      .expect(403);

    const bad = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", authHeader([PERMISSIONS.DEPARTMENT_CREATE]))
      .send({ name: `Bad ${Date.now()}`, headUserId: randomUUID() })
      .expect(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate department names", async () => {
    const name = `Dup Dept ${Date.now()}`;
    await request(app)
      .post("/api/v1/departments")
      .set("Authorization", authHeader([PERMISSIONS.DEPARTMENT_CREATE]))
      .send({ name })
      .expect(201);

    const dup = await request(app)
      .post("/api/v1/departments")
      .set("Authorization", authHeader([PERMISSIONS.DEPARTMENT_CREATE]))
      .send({ name })
      .expect(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });
});
