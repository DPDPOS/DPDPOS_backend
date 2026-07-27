import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import {
  getCachedPermissions,
  setCachedPermissions,
} from "../../../infrastructure/cache/permission-cache.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { relayOutboxOnceForTests } from "../../../events/outbox/outbox-relay.worker.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { signAccessToken } from "../utils/jwt.js";
import { encryptSecret } from "../utils/secret-crypto.js";
import { OrganizationService } from "../../organizations/services/organization.service.js";

describe("Auth follow-ups (invite, MFA, cache, outbox)", () => {
  const app = createApp();
  const orgService = new OrganizationService();
  const createdOrgIds: string[] = [];
  let organizationId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
    const org = await orgService.create({
      name: `Followup Org ${Date.now()}`,
    });
    organizationId = org.organization.id;
    createdOrgIds.push(organizationId);
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

  function authHeader(userId: string, permissions: string[], mfaVerified = false) {
    return `Bearer ${signAccessToken({
      actorUserId: userId,
      organizationId,
      roles: ["ORG_ADMIN"],
      permissions,
      mfaVerified,
    })}`;
  }

  it("accepts invite and allows login with the new password", async () => {
    const actorId = randomUUID();
    const email = `invitee.${Date.now()}@example.com`;

    const invited = await request(app)
      .post("/api/v1/users")
      .set(
        "Authorization",
        authHeader(actorId, [PERMISSIONS.USER_CREATE]),
      )
      .send({ email, name: "Invitee" })
      .expect(201);

    expect(invited.body.data.inviteToken).toBeTruthy();

    // Cannot login before accept-invite
    await request(app)
      .post("/api/v1/auth/login")
      .send({
        organizationId,
        email,
        password: "DoesNotMatter1!",
      })
      .expect(401);

    await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({
        organizationId,
        email,
        inviteToken: invited.body.data.inviteToken,
        password: "NewPassword123!",
      })
      .expect(200);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({
        organizationId,
        email,
        password: "NewPassword123!",
      })
      .expect(200);

    expect(login.body.data.mfaRequired).toBe(false);
    expect(login.body.data.tokens.accessToken).toBeTruthy();
    expect(login.body.data.user.status).toBe("ACTIVE");
  });

  it("challenges privileged MFA login and verifies TOTP", async () => {
    const email = `mfa.admin.${Date.now()}@example.com`;
    const password = "ChangeMe123!";
    const secret = authenticator.generateSecret();

    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    if (!adminRole) throw new Error("ORG_ADMIN missing");

    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "MFA Admin",
        passwordHash: await argon2.hash(password),
        status: "ACTIVE",
        mfaEnabled: true,
        mfaSecretEnc: encryptSecret(secret),
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: user.id,
        roleId: adminRole.id,
      },
    });

    const challenged = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(200);

    expect(challenged.body.data.mfaRequired).toBe(true);
    expect(challenged.body.data.mfaToken).toBeTruthy();

    const code = authenticator.generate(secret);
    const verified = await request(app)
      .post("/api/v1/auth/mfa/verify")
      .send({
        mfaToken: challenged.body.data.mfaToken,
        code,
      })
      .expect(200);

    expect(verified.body.data.mfaRequired).toBe(false);
    expect(verified.body.data.tokens.accessToken).toBeTruthy();
  });

  it("invalidates permission cache when role permissions change", async () => {
    const actorId = randomUUID();
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `cache.user.${Date.now()}@example.com`,
        name: "Cache User",
        status: "ACTIVE",
      },
    });

    await setCachedPermissions(organizationId, user.id, {
      permissions: [PERMISSIONS.CONTROL_READ],
      roles: ["CUSTOM"],
    });

    const cachedBefore = await getCachedPermissions(organizationId, user.id);
    expect(cachedBefore?.permissions).toContain(PERMISSIONS.CONTROL_READ);

    const role = await request(app)
      .post("/api/v1/roles")
      .set(
        "Authorization",
        authHeader(actorId, [
          PERMISSIONS.ROLE_CREATE,
          PERMISSIONS.ROLE_UPDATE_PERMISSIONS,
        ]),
      )
      .send({
        name: `Cache Role ${Date.now()}`,
        permissions: [PERMISSIONS.CONTROL_READ],
      })
      .expect(201);

    await prisma.userRole.create({
      data: {
        organizationId,
        userId: user.id,
        roleId: role.body.data.id,
      },
    });

    await setCachedPermissions(organizationId, user.id, {
      permissions: [PERMISSIONS.CONTROL_READ],
      roles: [role.body.data.name],
    });

    await request(app)
      .patch(`/api/v1/roles/${role.body.data.id}/permissions`)
      .set(
        "Authorization",
        authHeader(actorId, [PERMISSIONS.ROLE_UPDATE_PERMISSIONS]),
      )
      .send({
        permissions: [PERMISSIONS.CONTROL_READ, PERMISSIONS.REQUIREMENT_READ],
      })
      .expect(200);

    const cachedAfter = await getCachedPermissions(organizationId, user.id);
    expect(cachedAfter).toBeNull();
  });

  it("claims and publishes outbox events with lock isolation", async () => {
    await writeOutboxEvent(prisma, {
      eventType: DOMAIN_EVENTS.UserLoggedIn,
      organizationId,
      payload: { userId: randomUUID(), email: "outbox@example.com" },
    });

    await relayOutboxOnceForTests();

    const published = await prisma.outboxEvent.findMany({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.UserLoggedIn,
        publishedAt: { not: null },
      },
    });
    expect(published.length).toBeGreaterThan(0);
    expect(published[0]?.lockToken).toBeNull();
    expect(published[0]?.attempts).toBeGreaterThanOrEqual(1);
  });
});
