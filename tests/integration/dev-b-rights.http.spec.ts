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

/**
 * Cross-module happy path for Developer B — Feature RGT-002:
 * org → login → submit request → assign → respond → close → outbox
 */
describe("Dev B rights management end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `rgt002.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let requestId = "";
  let assigneeUserId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.dataSubjectRequest.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
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

  function bearer(token = accessToken) {
    return `Bearer ${token}`;
  }

  it("runs the full rights request lifecycle", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `RGT-002 Fiduciary ${Date.now()}`,
        industry: "fintech",
        maturityLevel: "Developing",
      })
      .expect(201);

    organizationId = orgRes.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    // 2) Admin user (ORG_ADMIN) + login
    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    expect(adminRole).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "RGT-002 Admin",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: user.id,
        roleId: adminRole!.id,
      },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(200);
    accessToken = login.body.data.tokens.accessToken as string;

    // 3) Assignee user (plain user in the same org, no special role needed)
    const assignee = await prisma.user.create({
      data: {
        organizationId,
        email: `rgt002.assignee.${Date.now()}@example.com`,
        name: "RGT-002 Assignee",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    assigneeUserId = assignee.id;

    // 4) Submit an erasure request → SUBMITTED, SLA due date, outbox event
    const created = await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", bearer())
      .send({
        requestType: "ERASURE",
        requesterReference: "data-principal-007@example.com",
      })
      .expect(201);

    expect(created.body.data.requestType).toBe("ERASURE");
    expect(created.body.data.status).toBe("SUBMITTED");
    expect(created.body.data.version).toBe(1);
    expect(created.body.data.dueAt).not.toBeNull();
    requestId = created.body.data.id as string;

    // 5) List + filter
    const list = await request(app)
      .get("/api/v1/data-subject-requests")
      .set("Authorization", bearer())
      .expect(200);
    expect(
      list.body.data.some((r: { id: string }) => r.id === requestId),
    ).toBe(true);

    const filtered = await request(app)
      .get("/api/v1/data-subject-requests")
      .query({ requestType: "ERASURE", status: "SUBMITTED" })
      .set("Authorization", bearer())
      .expect(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);
    expect(
      filtered.body.data.every(
        (r: { requestType: string; status: string }) =>
          r.requestType === "ERASURE" && r.status === "SUBMITTED",
      ),
    ).toBe(true);

    // 6) Get by id
    const got = await request(app)
      .get(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .expect(200);
    expect(got.body.data.id).toBe(requestId);

    // 7) Assign → ASSIGNED (version 2)
    const assigned = await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({ version: 1, status: "ASSIGNED", assignedTo: assigneeUserId })
      .expect(200);
    expect(assigned.body.data.status).toBe("ASSIGNED");
    expect(assigned.body.data.assignedTo).toBe(assigneeUserId);
    expect(assigned.body.data.version).toBe(2);

    // 8) Stale version → 409
    await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({ version: 1, status: "IN_PROGRESS" })
      .expect(409);

    // 9) In progress → responded with resolution
    const inProgress = await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({ version: 2, status: "IN_PROGRESS" })
      .expect(200);

    const responded = await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({
        version: inProgress.body.data.version,
        status: "RESPONDED",
        resolutionSummary: "Records deleted from all production systems.",
      })
      .expect(200);
    expect(responded.body.data.status).toBe("RESPONDED");

    // 10) Close requires a resolution summary
    await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({ version: responded.body.data.version, status: "CLOSED" })
      .expect(409);

    // 11) Close with resolution → CLOSED + outbox event
    const closed = await request(app)
      .patch(`/api/v1/data-subject-requests/${requestId}`)
      .set("Authorization", bearer())
      .send({
        version: responded.body.data.version,
        status: "CLOSED",
        resolutionSummary: "Records deleted from all production systems.",
      })
      .expect(200);
    expect(closed.body.data.status).toBe("CLOSED");
    expect(closed.body.data.closedAt).not.toBeNull();

    // 12) Validation error on bad request type
    const invalid = await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", bearer())
      .send({ requestType: "HACK", requesterReference: "x" })
      .expect(400);
    expect(invalid.body.success).toBe(false);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    // 13) Unauthorized without token
    await request(app).get("/api/v1/data-subject-requests").expect(401);

    // 14) MEMBER role is denied rights endpoints
    const memberRole = await prisma.role.findFirst({
      where: { organizationId, name: "MEMBER", deletedAt: null },
    });
    expect(memberRole).toBeTruthy();

    const memberUser = await prisma.user.create({
      data: {
        organizationId,
        email: `rgt002.member.${Date.now()}@example.com`,
        name: "RGT-002 Member",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: memberUser.id,
        roleId: memberRole!.id,
      },
    });

    const memberLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email: memberUser.email, password })
      .expect(200);
    const memberToken = memberLogin.body.data.tokens.accessToken as string;

    await request(app)
      .get("/api/v1/data-subject-requests")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ requestType: "ACCESS", requesterReference: "x@example.com" })
      .expect(403);

    // 15) COMPLIANCE_OFFICER can now create requests (preset wiring check)
    const officerRole = await prisma.role.findFirst({
      where: { organizationId, name: "COMPLIANCE_OFFICER", deletedAt: null },
    });
    expect(officerRole).toBeTruthy();

    const officerUser = await prisma.user.create({
      data: {
        organizationId,
        email: `rgt002.officer.${Date.now()}@example.com`,
        name: "RGT-002 Officer",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: officerUser.id,
        roleId: officerRole!.id,
      },
    });

    const officerLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email: officerUser.email, password })
      .expect(200);
    const officerToken = officerLogin.body.data.tokens.accessToken as string;

    const officerCreated = await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({
        requestType: "ACCESS",
        requesterReference: "officer-intake@example.com",
      })
      .expect(201);
    expect(officerCreated.body.data.status).toBe("SUBMITTED");

    // 16) Outbox contains both rights events
    const submitted = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.RightsRequestSubmitted,
      },
    });
    expect(submitted).not.toBeNull();

    const closedEvent = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.RightsRequestClosed,
      },
    });
    expect(closedEvent).not.toBeNull();
  });
});
