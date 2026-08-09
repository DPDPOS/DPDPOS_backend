import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Users HTTP API", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  let organizationId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const created = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Users HTTP Org ${Date.now()}` })
      .expect(201);
    organizationId = created.body.data.organization.id as string;
    createdOrgIds.push(organizationId);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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

  it("invites, lists, and patches a user", async () => {
    const email = `http.invite.${Date.now()}@example.com`;

    const created = await request(app)
      .post("/api/v1/users")
      .set(
        "Authorization",
        authHeader([PERMISSIONS.USER_CREATE, PERMISSIONS.USER_READ]),
      )
      .send({ email, name: "HTTP Invitee" })
      .expect(201);

    expect(created.body.data.status).toBe("INVITED");
    expect(created.body.data.roleNames).toContain("MEMBER");
    expect(created.body.data.passwordHash).toBeUndefined();
    expect(created.body.data.inviteToken).toBeTruthy();
    expect(created.body.data.inviteExpiresAt).toBeTruthy();
    const userId = created.body.data.id as string;

    const listed = await request(app)
      .get("/api/v1/users")
      .set("Authorization", authHeader([PERMISSIONS.USER_READ]))
      .expect(200);
    expect(listed.body.data.some((u: { id: string }) => u.id === userId)).toBe(true);

    const patched = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set("Authorization", authHeader([PERMISSIONS.USER_UPDATE]))
      .send({ status: "ACTIVE", name: "Activated" })
      .expect(200);
    expect(patched.body.data.status).toBe("ACTIVE");
    expect(patched.body.data.name).toBe("Activated");
  });

  it("returns 401/403 for unauthorized access", async () => {
    await request(app).get("/api/v1/users").expect(401);
    await request(app)
      .get("/api/v1/users")
      .set("Authorization", authHeader([PERMISSIONS.ORGANIZATION_READ]))
      .expect(403);
  });

  it("rejects duplicate invite emails", async () => {
    const email = `http.dup.${Date.now()}@example.com`;
    await request(app)
      .post("/api/v1/users")
      .set("Authorization", authHeader([PERMISSIONS.USER_CREATE]))
      .send({ email, name: "First" })
      .expect(201);

    const dup = await request(app)
      .post("/api/v1/users")
      .set("Authorization", authHeader([PERMISSIONS.USER_CREATE]))
      .send({ email, name: "Second" })
      .expect(409);

    expect(dup.body.error.code).toBe("CONFLICT");
  });
});
