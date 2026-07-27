import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { OrganizationService } from "../../organizations/services/organization.service.js";
import { verifyAccessToken } from "../utils/jwt.js";

describe("Auth JWT sessions HTTP API", () => {
  const app = createApp();
  const orgService = new OrganizationService();
  const createdOrgIds: string[] = [];
  let organizationId = "";
  let userId = "";
  const email = `auth.admin.${Date.now()}@example.com`;
  const password = "ChangeMe123!";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();

    const org = await orgService.create({ name: `Auth Org ${Date.now()}` });
    organizationId = org.organization.id;
    createdOrgIds.push(organizationId);

    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    if (!adminRole) throw new Error("ORG_ADMIN missing");

    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "Auth Admin",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    userId = user.id;

    await prisma.userRole.create({
      data: {
        organizationId,
        userId,
        roleId: adminRole.id,
      },
    });
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await disconnectRedis();
    await prisma.$disconnect();
  });

  it("logs in, returns me, refreshes, and logs out", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(200);

    expect(login.body.data.user.id).toBe(userId);
    expect(login.body.data.user.status).toBe("ACTIVE");
    expect(login.body.data.user.permissions).toContain(PERMISSIONS.ORGANIZATION_READ);
    expect(login.body.data.tokens.accessToken).toBeTruthy();
    expect(login.body.data.tokens.refreshToken).toBeTruthy();

    const accessToken = login.body.data.tokens.accessToken as string;
    const refreshToken = login.body.data.tokens.refreshToken as string;
    const claims = verifyAccessToken(accessToken);
    expect(claims.jti).toBeTruthy();

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(email);
    expect(me.body.data.roles).toContain("ORG_ADMIN");

    const outbox = await prisma.outboxEvent.findMany({
      where: { organizationId, eventType: DOMAIN_EVENTS.UserLoggedIn },
    });
    expect(outbox.some((row) => (row.payload as { userId?: string }).userId === userId)).toBe(
      true,
    );

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    expect(refreshed.body.data.refreshToken).not.toBe(refreshToken);

    // Old refresh token must not work after rotation
    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);

    const newAccess = refreshed.body.data.accessToken as string;
    const newRefresh = refreshed.body.data.refreshToken as string;

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${newAccess}`)
      .send({ refreshToken: newRefresh })
      .expect(200);

    // Revoked access token should be denied
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${newAccess}`)
      .expect(401);

    // Revoked refresh should fail
    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: newRefresh })
      .expect(401);
  });

  it("rejects bad passwords and disabled accounts", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password: "wrong-password" })
      .expect(401);

    await prisma.user.update({
      where: { id: userId },
      data: { status: "DISABLED" },
    });

    await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(401);

    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });
  });

  it("requires auth for /me", async () => {
    await request(app).get("/api/v1/auth/me").expect(401);
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${randomUUID()}`)
      .expect(401);
  });
});
