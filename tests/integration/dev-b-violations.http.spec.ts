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
import { validationRunService } from "../../src/modules/validations/services/validation-run.service.js";
import { validationExecutionService } from "../../src/modules/validations/services/validation-execution.service.js";
import { onValidationFailed } from "../../src/modules/violations/events/handlers/validation-failed.handler.js";

import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";

/**
 * Cross-module happy path for Developer B — Feature VIO-004:
 * org → login → failing validation → ValidationFailed outbox → event-bus
 * handler → Violation created → lifecycle (triage → assign → validate →
 * close) → ViolationClosed outbox.
 */
describe("Dev B violations end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `vio004.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let assigneeUserId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdOrgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  function bearer(token = accessToken) {
    return `Bearer ${token}`;
  }

  it("runs the ValidationFailed → Violation → lifecycle → close flow", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `VIO-004 Fiduciary ${Date.now()}`,
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
        name: "VIO-004 Admin",
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
        email: `vio004.assignee.${Date.now()}@example.com`,
        name: "VIO-004 Assignee",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    assigneeUserId = assignee.id;

    // 4) Run a validation — a fresh org fails notice-present.
    const run = await validationRunService.trigger(
      {
        correlationId: "seed-run",
        organizationId,
        actorUserId: user.id,
        permissions: [],
        roles: [],
      },
      {},
    );
    await validationExecutionService.executeRun(run.id);
    await prisma.validationResult.deleteMany({ where: { runId: run.id } });
    await prisma.validationRun.delete({ where: { id: run.id } });

    // 5) Trigger a fresh failing run via the API, execute it (worker path),
    //    and let the event-bus handler consume ValidationFailed.
    const triggered = await request(app)
      .post("/api/v1/validation-runs")
      .set("Authorization", bearer())
      .send({})
      .expect(201);
    const runId = triggered.body.data.id as string;

    await validationExecutionService.executeRun(runId);

    const failedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ValidationFailed,
        payload: { path: ["runId"], equals: runId },
      },
    });
    expect(failedOutbox).not.toBeNull();

    // Simulate the event-bus worker dispatching the outboxed event to its
    // registered handler (exactly what startEventBusWorker does in production).
    await onValidationFailed({
      eventId: failedOutbox!.id,
      eventType: DOMAIN_EVENTS.ValidationFailed,
      organizationId,
      occurredAt: failedOutbox!.createdAt.toISOString(),
      payload: failedOutbox!.payload as Record<string, unknown>,
    });

    // 6) The violation was auto-created from the event.
    const violations = await request(app)
      .get("/api/v1/violations")
      .set("Authorization", bearer())
      .expect(200);

    expect(violations.body.data.length).toBeGreaterThanOrEqual(1);
    const created = violations.body.data.find(
      (v: { title: string }) => v.title.includes("Notice is present"),
    );
    expect(created).toBeTruthy();
    expect(created.status).toBe("OPEN");
    expect(created.evidenceRequiredFlag).toBe(true);
    const violationId = created.id as string;

    // 7) Manual violation creation
    const manual = await request(app)
      .post("/api/v1/violations")
      .set("Authorization", bearer())
      .send({
        severity: "HIGH",
        title: "Manual incident",
        description: "Discovered during review.",
      })
      .expect(201);
    expect(manual.body.data.status).toBe("OPEN");

    // 8) Lifecycle: triage → assign → in progress → validate → close
    const triaged = await request(app)
      .patch(`/api/v1/violations/${violationId}`)
      .set("Authorization", bearer())
      .send({ version: created.version, status: "TRIAGE" })
      .expect(200);

    const assigned = await request(app)
      .patch(`/api/v1/violations/${violationId}`)
      .set("Authorization", bearer())
      .send({
        version: triaged.body.data.version,
        status: "ASSIGNED",
        assignedTo: assigneeUserId,
      })
      .expect(200);

    const inProgress = await request(app)
      .patch(`/api/v1/violations/${violationId}`)
      .set("Authorization", bearer())
      .send({ version: assigned.body.data.version, status: "IN_PROGRESS" })
      .expect(200);

    const validated = await request(app)
      .patch(`/api/v1/violations/${violationId}`)
      .set("Authorization", bearer())
      .send({ version: inProgress.body.data.version, status: "VALIDATED" })
      .expect(200);

    // 9) Closing from a non-VALIDATED state is rejected — try on the manual one.
    await request(app)
      .post(`/api/v1/violations/${manual.body.data.id}/close`)
      .set("Authorization", bearer())
      .send({ version: 1, resolutionSummary: "early close" })
      .expect(409);

    // 10) Close the validated violation → ViolationClosed
    const closed = await request(app)
      .post(`/api/v1/violations/${violationId}/close`)
      .set("Authorization", bearer())
      .send({
        version: validated.body.data.version,
        resolutionSummary: "Privacy notice published; asset tagged.",
      })
      .expect(200);
    expect(closed.body.data.status).toBe("CLOSED");
    expect(closed.body.data.closedAt).not.toBeNull();

    // 11) Stale version → 409 on the closed violation
    await request(app)
      .patch(`/api/v1/violations/${violationId}`)
      .set("Authorization", bearer())
      .send({ version: 1, status: "OPEN" })
      .expect(409);

    // 12) Unauthorized without token
    await request(app).get("/api/v1/violations").expect(401);

    // 13) MEMBER role is denied violation endpoints
    const memberRole = await prisma.role.findFirst({
      where: { organizationId, name: "MEMBER", deletedAt: null },
    });
    expect(memberRole).toBeTruthy();

    const memberUser = await prisma.user.create({
      data: {
        organizationId,
        email: `vio004.member.${Date.now()}@example.com`,
        name: "VIO-004 Member",
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
      .get("/api/v1/violations")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app)
      .post("/api/v1/violations")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ severity: "LOW", title: "denied" })
      .expect(403);

    // 14) Outbox carries ViolationCreated + ViolationClosed
    const createdOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ViolationCreated,
      },
    });
    expect(createdOutbox).not.toBeNull();

    const closedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ViolationClosed,
      },
    });
    expect(closedOutbox).not.toBeNull();
  });
});
