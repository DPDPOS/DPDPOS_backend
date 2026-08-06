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
import type { BaseDomainEvent } from "../../src/events/types/base-event.interface.js";
import { onViolationCreated } from "../../src/modules/remediation/events/handlers/violation-created.handler.js";

/**
 * Cross-module happy path for Developer B — Feature REM-005:
 * org → login → violation created (ViolationCreated outbox) → event-bus
 * handler auto-creates a remediation task → manual task with assignment →
 * lifecycle (start → submit → verify → close) → RemediationCompleted outbox.
 */
describe("Dev B remediation end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `rem005.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let assigneeUserId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.remediationTask.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.violation.deleteMany({
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

  it("runs the ViolationCreated → remediation task → lifecycle → close flow", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `REM-005 Fiduciary ${Date.now()}`,
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
        name: "REM-005 Admin",
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

    // 3) Assignee user
    const assignee = await prisma.user.create({
      data: {
        organizationId,
        email: `rem005.assignee.${Date.now()}@example.com`,
        name: "REM-005 Assignee",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    assigneeUserId = assignee.id;

    // 4) Open a violation via the API → ViolationCreated outbox row.
    const createdViolation = await request(app)
      .post("/api/v1/violations")
      .set("Authorization", bearer())
      .send({
        severity: "HIGH",
        title: "Privacy notice is missing",
        description: "No notice published before processing.",
      })
      .expect(201);
    const violationId = createdViolation.body.data.id as string;
    expect(createdViolation.body.data.status).toBe("OPEN");

    // 5) The event-bus handler auto-creates a PENDING task (worker path).
    const createdOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ViolationCreated,
        payload: { path: ["violationId"], equals: violationId },
      },
    });
    expect(createdOutbox).not.toBeNull();

    await onViolationCreated({
      eventId: createdOutbox!.id,
      eventType: DOMAIN_EVENTS.ViolationCreated,
      organizationId,
      occurredAt: createdOutbox!.createdAt.toISOString(),
      payload: createdOutbox!.payload as Record<string, unknown>,
    });

    // 6) Manual task with assignment → RemediationTaskAssigned outbox.
    const manual = await request(app)
      .post("/api/v1/remediation-tasks")
      .set("Authorization", bearer())
      .send({
        violationId,
        taskTitle: "Publish the DPDP privacy notice",
        taskDescription: "Draft, legal review, publish, and log version.",
        assignedTo: assigneeUserId,
        dueAt: "2026-09-15T00:00:00.000Z",
      })
      .expect(201);
    expect(manual.body.data.status).toBe("PENDING");
    expect(manual.body.data.source).toBe("MANUAL");
    expect(manual.body.data.assignedTo).toBe(assigneeUserId);
    const manualTaskId = manual.body.data.id as string;

    // 7) Both the auto task and the manual task are visible.
    const tasks = await request(app)
      .get("/api/v1/remediation-tasks")
      .set("Authorization", bearer())
      .expect(200);
    expect(tasks.body.data.length).toBeGreaterThanOrEqual(2);
    const autoTask = tasks.body.data.find(
      (t: { source: string }) => t.source === "AUTO",
    );
    expect(autoTask).toBeTruthy();
    expect(autoTask.status).toBe("PENDING");
    expect(autoTask.taskTitle).toContain("Privacy notice is missing");
    const autoTaskId = autoTask.id as string;

    // 8) Closing without verification is rejected.
    await request(app)
      .post(`/api/v1/remediation-tasks/${autoTaskId}/close`)
      .set("Authorization", bearer())
      .send({ version: 1, resolutionSummary: "early close" })
      .expect(409);

    // 9) Lifecycle: start → submit → verify → close.
    const started = await request(app)
      .patch(`/api/v1/remediation-tasks/${manualTaskId}`)
      .set("Authorization", bearer())
      .send({ version: 1, status: "IN_PROGRESS" })
      .expect(200);

    const submitted = await request(app)
      .patch(`/api/v1/remediation-tasks/${manualTaskId}`)
      .set("Authorization", bearer())
      .send({
        version: started.body.data.version,
        status: "PENDING_VERIFICATION",
        verificationNotes: "Notice published; awaiting verification.",
      })
      .expect(200);

    const verified = await request(app)
      .patch(`/api/v1/remediation-tasks/${manualTaskId}`)
      .set("Authorization", bearer())
      .send({
        version: submitted.body.data.version,
        status: "VERIFIED",
        verificationNotes: "Verified: notice live with version v1.",
      })
      .expect(200);
    expect(verified.body.data.verifiedAt).not.toBeNull();

    const closed = await request(app)
      .post(`/api/v1/remediation-tasks/${manualTaskId}/close`)
      .set("Authorization", bearer())
      .send({
        version: verified.body.data.version,
        resolutionSummary: "Notice published and verified by DPO.",
      })
      .expect(200);
    expect(closed.body.data.status).toBe("CLOSED");
    expect(closed.body.data.closedAt).not.toBeNull();

    // 10) Stale version → 409 on the closed task.
    await request(app)
      .patch(`/api/v1/remediation-tasks/${manualTaskId}`)
      .set("Authorization", bearer())
      .send({ version: 1, status: "IN_PROGRESS" })
      .expect(409);

    // 11) Unauthorized without token.
    await request(app).get("/api/v1/remediation-tasks").expect(401);

    // 12) MEMBER role is denied remediation endpoints.
    const memberRole = await prisma.role.findFirst({
      where: { organizationId, name: "MEMBER", deletedAt: null },
    });
    expect(memberRole).toBeTruthy();

    const memberUser = await prisma.user.create({
      data: {
        organizationId,
        email: `rem005.member.${Date.now()}@example.com`,
        name: "REM-005 Member",
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
      .get("/api/v1/remediation-tasks")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app)
      .post("/api/v1/remediation-tasks")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ violationId, taskTitle: "denied" })
      .expect(403);

    // 13) Outbox carries RemediationTaskAssigned + RemediationCompleted.
    const assignedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.RemediationTaskAssigned,
      },
    });
    expect(assignedOutbox).not.toBeNull();

    const completedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.RemediationCompleted,
      },
    });
    expect(completedOutbox).not.toBeNull();
  });
});
