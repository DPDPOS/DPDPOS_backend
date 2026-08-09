import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Roles HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const created = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Roles HTTP Org ${Date.now()}` })
      .expect(201);
    organizationId = created.body.data.organization.id as string;
    createdOrgIds.push(organizationId);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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
    const token = signAccessToken({
      actorUserId: randomUUID(),
      organizationId,
      roles: ["ORG_ADMIN"],
      permissions,
    });
    return `Bearer ${token}`;
  }

  it("lists roles when authorized", async () => {
    const res = await request(app)
      .get("/api/v1/roles")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.ROLE_READ]),
      )
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    expect(res.body.meta.pagination.total).toBeGreaterThanOrEqual(5);
  });

  it("creates a role and updates permissions", async () => {
    const created = await request(app)
      .post("/api/v1/roles")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.ROLE_CREATE, PERMISSIONS.ROLE_READ]),
      )
      .send({
        name: `Ops ${Date.now()}`,
        permissions: [PERMISSIONS.DEPARTMENT_READ],
      })
      .expect(201);

    expect(created.body.data.isSystemRole).toBe(false);
    const roleId = created.body.data.id as string;

    const patched = await request(app)
      .patch(`/api/v1/roles/${roleId}/permissions`)
      .set(
        "Authorization",
        authHeader([PERMISSIONS.ROLE_UPDATE_PERMISSIONS]),
      )
      .send({
        permissions: [PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.DEPARTMENT_CREATE],
      })
      .expect(200);

    expect(patched.body.data.permissions).toContain(PERMISSIONS.DEPARTMENT_CREATE);
  });

  it("returns 401 without token and 403 without permission", async () => {
    await request(app).get("/api/v1/roles").expect(401);

    await request(app)
      .get("/api/v1/roles")
      .set("Authorization", authHeader([PERMISSIONS.ORGANIZATION_READ]))
      .expect(403);
  });

  it("rejects unknown permissions on create", async () => {
    const res = await request(app)
      .post("/api/v1/roles")
      .set("Authorization", authHeader([PERMISSIONS.ROLE_CREATE]))
      .send({
        name: `Invalid ${Date.now()}`,
        permissions: ["nope:nope"],
      })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
